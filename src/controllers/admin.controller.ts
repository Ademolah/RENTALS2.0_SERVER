import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { User } from '../models/User.js';
import { Property } from '../models/Property.js';
import { Car } from '../models/Car.js';
import { Reservation } from '../models/Reservation.js';
import { CarReservation } from '../models/CarReservation.js';
import  HostRequest  from '../models/HostRequest.js'; 

// ==========================================
// 1. PLATFORM OVERVIEW (STATS)
// ==========================================
export const getDashboardStats = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const totalUsers = await User.countDocuments({ role: 'USER' as any });
  const totalHosts = await User.countDocuments({ role: 'LANDLORD' as any });
  const pendingHosts = await HostRequest.countDocuments({ status: 'PENDING' });

  // 💡 NEW: Let the admin know how many properties are waiting for review
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
      // 💡 NEW: pendingAssets added to the response payload
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
  // Cast params explicitly as strings to satisfy TypeScript
  const { assetType, assetId } = req.params as { assetType: string; assetId: string };
  const { status } = req.body;

  if (!assetType || !assetId) {
    return next(new AppError('Asset type and ID are required', 400));
  }

  // Validate the incoming status string
  const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];
  if (!validStatuses.includes(status)) {
    return next(new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400));
  }

  let updatedAsset;
  const typeStr = assetType.toUpperCase(); // This will now work without errors!
  
  const isPropertyModel = ['PROPERTY', 'SHORTLET', 'HOTEL', 'VIP', 'VIP RESERVATION'].includes(typeStr);

  if (isPropertyModel) {
    updatedAsset = await Property.findByIdAndUpdate(
      assetId,
      { status },
      { new: true, runValidators: true }
    );
  } else if (typeStr === 'CAR') {
    updatedAsset = await Car.findByIdAndUpdate(
      assetId,
      { status },
      { new: true, runValidators: true }
    );
  } else {
    return next(new AppError('Invalid asset type.', 400));
  }

  if (!updatedAsset) {
    return next(new AppError('Asset not found', 404));
  }

  res.status(200).json({
    status: 'success',
    message: `${typeStr} listing status successfully updated to ${status}`,
    data: {
      asset: updatedAsset
    }
  });
});
