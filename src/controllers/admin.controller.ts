import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose'
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { User } from '../models/User.js';
import { Property } from '../models/Property.js';
import { Car } from '../models/Car.js';
import { Reservation } from '../models/Reservation.js';
import { CarReservation } from '../models/CarReservation.js';
import HostRequest from '../models/HostRequest.js'; 
import { NotificationService } from '../services/notification.service.js'; // 💡 INJECTED: For Push Notifications

// ==========================================
// 1. PLATFORM OVERVIEW (STATS)
// ==========================================
export const getDashboardStats = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const totalUsers = await User.countDocuments({ role: 'USER' as any });
  const totalHosts = await User.countDocuments({ role: 'LANDLORD' as any });
  const pendingHosts = await HostRequest.countDocuments({ status: 'PENDING' });

  const pendingAssets = await Property.countDocuments({ status: 'PENDING' });

  const totalShortlets = await Property.countDocuments({ category: 'SHORTLET' });
  const totalHotels = await Property.countDocuments({ category: 'HOTEL' });
  const totalVip = await Property.countDocuments({ category: 'VIP RESERVATION' });
  const totalCars = await Car.countDocuments();

  const propertyReservations = await Reservation.find({ paymentStatus: 'SUCCESS' });
  const carReservations = await CarReservation.find({ paymentStatus: 'SUCCESS' });

  let totalPlatformVolume = 0;
  let escrowCurrentlyHeld = 0;

  propertyReservations.forEach(res => {
    totalPlatformVolume += res.totalAmount;
    const escrowStatus = (res as any).escrowStatus;
    const payoutStatus = (res as any).payoutStatus;
    
    if (escrowStatus === 'HELD' || payoutStatus === 'HELD_IN_ESCROW') {
      escrowCurrentlyHeld += res.totalAmount;
    }
  });

  carReservations.forEach(res => {
    totalPlatformVolume += res.totalAmount;
    const escrowStatus = (res as any).escrowStatus;
    if (escrowStatus === 'HELD') {
      escrowCurrentlyHeld += res.totalAmount;
    }
  });

  const totalPlatformRevenue = totalPlatformVolume * 0.05; 

  res.status(200).json({
    status: 'success',
    data: {
      users: { totalUsers, totalHosts, pendingHosts },
      assets: { totalShortlets, totalHotels, totalVip, totalCars, pendingAssets },
      financials: { 
        totalPlatformVolume, 
        escrowCurrentlyHeld, 
        totalPlatformRevenue 
      }
    }
  });
});

// ==========================================
// 2. ESCROW & PAYOUT LEDGER
// ==========================================
export const getEscrowLedger = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const propertyBookings = await Reservation.find()
    .populate('userId', 'firstName lastName email phoneNumber')
    .populate('propertyId', 'title category propertyId pricePerNight')
    .sort('-createdAt')
    .lean();

  const carBookings = await CarReservation.find()
    .populate('userId', 'firstName lastName email phoneNumber')
    .populate('carId', 'make model year pricePer12Hours')
    .sort('-createdAt')
    .lean();

  const masterLedger = [...propertyBookings, ...carBookings].sort((a: any, b: any) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  res.status(200).json({
    status: 'success',
    results: masterLedger.length,
    data: {
      ledger: masterLedger
    }
  });
});

// ==========================================
// 3. ASSET OVERSIGHT (PROPERTIES & CARS)
// ==========================================
export const getAssetOversight = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const properties = await Property.find()
    .populate('ownerId', 'firstName lastName email')
    .sort('-createdAt');

  const cars = await Car.find()
    .populate('ownerId', 'firstName lastName email')
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    data: {
      properties,
      cars
    }
  });
});

// ==========================================
// 4. VERIFY / SUSPEND ASSETS (Legacy Booleans)
// ==========================================
export const toggleAssetStatus = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const assetType = req.params.assetType as string;
  const assetId = req.params.assetId as string;
  const { isVerified, isAvailable } = req.body;

  if (!assetType || !assetId) {
    return next(new AppError('Asset type and ID are required', 400));
  }

  let updatedAsset;
  const typeStr = assetType.toUpperCase();
  
  const isPropertyModel = ['PROPERTY', 'SHORTLET', 'HOTEL', 'VIP', 'VIP RESERVATION'].includes(typeStr);

  if (isPropertyModel) {
    updatedAsset = await Property.findByIdAndUpdate(
      assetId,
      { 
        ...(typeof isVerified === 'boolean' && { isVerified }),
        ...(typeof isAvailable === 'boolean' && { isAvailable })
      },
      { new: true, runValidators: true }
    );
  } else if (typeStr === 'CAR') {
    updatedAsset = await Car.findByIdAndUpdate(
      assetId,
      { 
        ...(typeof isVerified === 'boolean' && { isVerified }),
        ...(typeof isAvailable === 'boolean' && { isAvailable })
      },
      { new: true, runValidators: true }
    );
  } else {
    return next(new AppError('Invalid asset type. Must be a valid property category or CAR', 400));
  }

  if (!updatedAsset) {
    return next(new AppError('Asset not found', 404));
  }

  res.status(200).json({
    status: 'success',
    message: `${typeStr} status updated successfully`,
    data: {
      asset: updatedAsset
    }
  });
});

// ==========================================
// 5. 💡 NEW: APPROVE / REJECT LISTING WORKFLOW
// ==========================================
export const updateAssetApprovalStatus = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { assetType, assetId } = req.params as { assetType: string; assetId: string };
  const { status, rejectionReason } = req.body; // 💡 INJECTED: Extract rejection reason

  if (!assetType || !assetId) {
    return next(new AppError('Asset type and ID are required', 400));
  }

  const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];
  if (!validStatuses.includes(status)) {
    return next(new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400));
  }

  // Ensure admins provide a reason when rejecting
  if (status === 'REJECTED' && !rejectionReason) {
    return next(new AppError('A rejection reason is required when rejecting a listing.', 400));
  }

  // 💡 Build the update payload
  const updatePayload: any = { status };
  if (status === 'REJECTED') {
    updatePayload.rejectionReason = rejectionReason;
  } else if (status === 'APPROVED' || status === 'PENDING') {
    updatePayload.rejectionReason = ''; // Clear it if they fix it or it gets approved
  }

  let updatedAsset;
  const typeStr = assetType.toUpperCase();
  
  // Safely check all possible property categories
  const isPropertyModel = ['PROPERTY', 'SHORTLET', 'HOTEL', 'VIP', 'VIP RESERVATION', 'VIP_SERVICE'].includes(typeStr);

  if (isPropertyModel) {
    updatedAsset = await Property.findByIdAndUpdate(
      assetId,
      updatePayload,
      { new: true, runValidators: true }
    );
  } else if (typeStr === 'CAR') {
    updatedAsset = await Car.findByIdAndUpdate(
      assetId,
      updatePayload,
      { new: true, runValidators: true }
    );
  } else {
    return next(new AppError('Invalid asset type.', 400));
  }

  if (!updatedAsset) {
    return next(new AppError('Asset not found', 404));
  }

  // ==========================================
  // 💡 INJECTED: SEND PUSH NOTIFICATION TO HOST
  // ==========================================
  if (status === 'APPROVED' || status === 'REJECTED') {
    const title = status === 'APPROVED' ? 'Listing Approved! 🎉' : 'Listing Rejected ❌';
    let message = `Your ${typeStr.toLowerCase()} listing has been ${status.toLowerCase()}.`;
    
    if (status === 'REJECTED' && rejectionReason) {
      message += ` Reason: ${rejectionReason}`;
    }

    // Fire and forget the notification
    await NotificationService.sendPush(
      updatedAsset.ownerId.toString(),
      title,
      message,
      "HOST_APPROVAL",
      assetId
    ).catch(err => console.error("Failed to send approval push:", err));
  }

  res.status(200).json({
    status: 'success',
    message: `${typeStr} listing status successfully updated to ${status}`,
    data: {
      asset: updatedAsset
    }
  });
});

// ==========================================
// 6. USER DIRECTORY & REGULATORY DOSSIER
// ==========================================

// Escape regex metacharacters to prevent ReDoS / NoSQL regex injection
const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getAllUsers = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // Defense-in-depth role verification
  if (req.user?.role !== 'ADMIN') {
    return next(new AppError('Access denied. Admin privileges required.', 403));
  }

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const skip = (page - 1) * limit;

  const filter: Record<string, any> = {};

  // Strictly whitelist role filter
  const role = (req.query.role as string)?.toUpperCase();
  if (role && ['USER', 'LANDLORD', 'SUPPORT_AGENT', 'ADMIN'].includes(role)) {
    filter.role = role;
  }

  // Optional verification status filter
  if (req.query.isVerified === 'true') filter.isVerified = true;
  if (req.query.isVerified === 'false') filter.isVerified = false;

  // Sanitized search across name, email, phone, and host display name
  const rawSearch = (req.query.search as string)?.trim();
  if (rawSearch) {
    const safeRegex = new RegExp(escapeRegex(rawSearch), 'i');
    filter.$or = [
      { firstName: safeRegex },
      { lastName: safeRegex },
      { hostDisplayName: safeRegex },
      { email: safeRegex },
      { phoneNumber: safeRegex },
    ];
  }

  const [users, filteredCount] = await Promise.all([
    User.find(filter)
      .select('-passwordHash -verificationCode -verificationCodeExpires -pushTokens')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  console.info(
    `[ADMIN AUDIT] Admin ${req.user._id} (${req.user.email}) queried user directory (page=${page}, limit=${limit}, results=${users.length})`
  );

  res.status(200).json({
    status: 'success',
    results: users.length,
    pagination: {
      total: filteredCount,
      page,
      limit,
      totalPages: Math.ceil(filteredCount / limit) || 1,
    },
    data: {
      users,
    },
  });
});

export const getUserDetails = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // Defense-in-depth role verification
  if (req.user?.role !== 'ADMIN') {
    return next(new AppError('Access denied. Admin privileges required.', 403));
  }

  const userId = req.params.userId as string;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(new AppError('Invalid user ID provided.', 400));
  }

  // Fetch core identity + bank profile (explicitly stripping credentials & OTP codes)
  const user = await User.findById(userId)
    .select('-passwordHash -verificationCode -verificationCodeExpires -pushTokens')
    .lean();

  if (!user) {
    return next(new AppError('User not found.', 404));
  }

  // Fetch KYC / host applications, owned assets, and booking history in parallel
  const [
    hostApplications,
    ownedProperties,
    ownedCars,
    propertyBookingsAsGuest,
    carBookingsAsGuest,
  ] = await Promise.all([
    HostRequest.find({ userId }).sort('-createdAt').lean(),
    Property.find({ ownerId: userId })
      .select('title category status isVerified isAvailable pricePerNight cautionFee address createdAt')
      .sort('-createdAt')
      .lean(),
    Car.find({ ownerId: userId })
      .select('make carModel model year category status isVerified isAvailable pricePer12Hours location createdAt')
      .sort('-createdAt')
      .lean(),
    Reservation.find({ userId })
      .populate('propertyId', 'title category address')
      .sort('-createdAt')
      .lean(),
    CarReservation.find({ userId })
      .populate('carId', 'make carModel model year')
      .sort('-createdAt')
      .lean(),
  ]);

  // If the user owns properties or cars, also fetch incoming host bookings for full financial auditability
  const ownedPropertyIds = ownedProperties.map((p: any) => p._id);
  const ownedCarIds = ownedCars.map((c: any) => c._id);

  const [propertyBookingsAsHost, carBookingsAsHost] = await Promise.all([
    ownedPropertyIds.length > 0
      ? Reservation.find({ propertyId: { $in: ownedPropertyIds } })
          .populate('userId', 'firstName lastName email phoneNumber')
          .populate('propertyId', 'title category')
          .sort('-createdAt')
          .lean()
      : Promise.resolve([]),
    ownedCarIds.length > 0
      ? CarReservation.find({ carId: { $in: ownedCarIds } })
          .populate('userId', 'firstName lastName email phoneNumber')
          .populate('carId', 'make carModel model year')
          .sort('-createdAt')
          .lean()
      : Promise.resolve([]),
  ]);

  // Aggregate settled financial totals for quick regulatory/compliance review
  const totalSpentAsGuest = [...propertyBookingsAsGuest, ...carBookingsAsGuest]
    .filter((b: any) => b.paymentStatus === 'SUCCESS')
    .reduce((sum: number, b: any) => sum + (Number(b.totalAmount) || 0), 0);

  const totalGrossAsHost = [...propertyBookingsAsHost, ...carBookingsAsHost]
    .filter((b: any) => b.paymentStatus === 'SUCCESS')
    .reduce((sum: number, b: any) => sum + (Number(b.totalAmount) || 0), 0);

  // Regulatory compliance audit log
  console.info(
    `[ADMIN AUDIT] Admin ${req.user._id} (${req.user.email}) inspected full regulatory dossier for User ${user._id} (${user.email})`
  );

  res.status(200).json({
    status: 'success',
    data: {
      user,
      complianceSummary: {
        accountStatus: user.isVerified ? 'VERIFIED' : 'UNVERIFIED',
        hasBankDetailsOnFile: Boolean((user as any).bankDetails?.accountNumber),
        hasPaystackRecipient: Boolean((user as any).bankDetails?.recipientCode),
        totalOwnedAssets: ownedProperties.length + ownedCars.length,
        totalGuestBookings: propertyBookingsAsGuest.length + carBookingsAsGuest.length,
        totalHostBookings: propertyBookingsAsHost.length + carBookingsAsHost.length,
        totalSpentAsGuest,
        totalGrossAsHost,
      },
      kyc: {
        hostApplications,
      },
      assets: {
        properties: ownedProperties,
        cars: ownedCars,
      },
      transactions: {
        asGuest: {
          properties: propertyBookingsAsGuest,
          cars: carBookingsAsGuest,
        },
        asHost: {
          properties: propertyBookingsAsHost,
          cars: carBookingsAsHost,
        },
      },
    },
  });
});

// ==========================================
// 7. STAFF ROLE PROMOTION / REVOCATION
// ==========================================
export const updateUserRole = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // Defense-in-depth Super Admin check
  if (req.user?.role !== 'ADMIN') {
    return next(new AppError('Access denied. Admin privileges required.', 403));
  }

  const userId = req.params.userId as string;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(new AppError('Invalid user ID provided.', 400));
  }

  const nextRole = String(req.body?.role || '').toUpperCase().trim();
  if (!['USER', 'SUPPORT_AGENT'].includes(nextRole)) {
    return next(
      new AppError('Invalid target role. Only USER and SUPPORT_AGENT transitions are permitted.', 400)
    );
  }

  // Prevent self-modification
  if (req.user._id.toString() === userId) {
    return next(new AppError('You cannot modify your own administrative role.', 403));
  }

  const targetUser = await User.findById(userId)
    .select('-passwordHash -verificationCode -verificationCodeExpires -pushTokens')
    .lean();

  if (!targetUser) {
    return next(new AppError('User not found.', 404));
  }

  // Protect Super Admins and verified Landlords from accidental reassignment
  if (targetUser.role === 'ADMIN') {
    return next(new AppError('Cannot modify the role of another Super Admin.', 403));
  }

  if (targetUser.role === 'LANDLORD') {
    return next(
      new AppError('Cannot reassign a Landlord account via Support Agent promotion.', 400)
    );
  }

  if (targetUser.role === nextRole) {
    return res.status(200).json({
      status: 'success',
      message: `User already has role ${nextRole}.`,
      data: {
        user: targetUser,
      },
    });
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { role: nextRole },
    { new: true, runValidators: true }
  )
    .select('-passwordHash -verificationCode -verificationCodeExpires -pushTokens')
    .lean();

  console.info(
    `[ADMIN AUDIT] Admin ${req.user._id} (${req.user.email}) updated role for User ${userId} (${targetUser.email}) from ${targetUser.role} to ${nextRole}`
  );

  res.status(200).json({
    status: 'success',
    message: `User role updated to ${nextRole} successfully.`,
    data: {
      user: updatedUser,
    },
  });
});