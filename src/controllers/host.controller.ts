import { Request, Response, NextFunction } from 'express';
import HostRequest from '../models/HostRequest.js';
import { User } from '../models/User.js'; // Adjust to { User } if you use named exports
import { Property } from '../models/Property.js';
import { Car } from '../models/Car.js';
import { Reservation } from '../models/Reservation.js';
import { CarReservation } from '../models/CarReservation.js';
import { EmailService } from '../services/email.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

export const submitHostApplication = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { address, city, state, nin } = req.body;
  
  if (!req.user) {
    return next(new AppError('Authentication context missing.', 401));
  }
  
  // Using the non-null assertion operator matching your car.controller.ts
  const userId = req.user!._id.toString();

  const user = await User.findById(userId);
  if (!user) {
    return next(new AppError('User not found.', 404));
  }

  if (user.role === 'LANDLORD') {
    return next(new AppError('You are already an approved host.', 400));
  }

  const existingRequest = await HostRequest.findOne({ user: userId, status: 'PENDING' });
  if (existingRequest) {
    return next(new AppError('You already have a pending host application.', 400));
  }

  const ninInUse = await HostRequest.findOne({ nin });
  if (ninInUse) {
    return next(new AppError('This National ID (NIN) has already been registered on our platform.', 400));
  }

  const hostRequest = await HostRequest.create({
    user: userId,
    address,
    city,
    state,
    nin
  });

  res.status(201).json({
    status: 'success',
    message: 'Application submitted successfully. Our team will review your details.',
    data: { hostRequest }
  });
});

export const processHostApplication = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { status, adminNotes } = req.body;
  const { id } = req.params;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return next(new AppError('Invalid status update. Must be APPROVED or REJECTED.', 400));
  }

  const hostRequest = await HostRequest.findById(id).populate('user');
  
  if (!hostRequest) {
    return next(new AppError('Host request not found.', 404));
  }

  if (hostRequest.status !== 'PENDING') {
    return next(new AppError('This request has already been processed.', 400));
  }

  hostRequest.status = status;
  if (adminNotes) hostRequest.adminNotes = adminNotes;
  await hostRequest.save();

  if (status === 'APPROVED') {
    const user = hostRequest.user as any;
    user.role = 'LANDLORD';
    user.isVerified = true;
    await user.save();

    // Fire and forget the welcome email without blocking the response
    EmailService.sendHostWelcome({
      to: user.email,
      firstName: user.firstName,
      dashboardUrl: 'https://rentalsafrica.com/dashboard/landlord'
    }).catch(console.error);
  }

  res.status(200).json({
    status: 'success',
    message: `Application successfully ${status.toLowerCase()}.`,
    data: { hostRequest }
  });
});

export const getHostApplications = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const requests = await HostRequest.find()
    .populate('user', 'firstName lastName email phoneNumber')
    .sort('-createdAt');
    
  res.status(200).json({
    status: 'success',
    results: requests.length,
    data: { requests }
  });
});

export const checkApplicationStatus = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user!._id.toString();
  
  // Find the most recent application submitted by this user
  const request = await HostRequest.findOne({ user: userId }).sort('-createdAt');
  
  res.status(200).json({
    status: 'success',
    data: { 
      // Returns 'PENDING', 'REJECTED', 'APPROVED', or 'IDLE' (if they never applied)
      status: request ? request.status : 'IDLE',
      notes: request ? request.adminNotes : ''
    }
  });
});

// ==========================================
// NEW: GET HOST EARNINGS ANALYTICS
// ==========================================
export const getHostEarningsAnalytics = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const hostId = req.user?._id;

  if (!hostId) {
    return next(new AppError('Authentication required to view analytics.', 401));
  }

  // 1. Set strict boundaries for the current year to prevent data bleeding
  const currentYear = new Date().getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);
  const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

  // 2. Fetch all asset IDs owned by this specific host
  const properties = await Property.find({ ownerId: hostId }).select('_id');
  const propertyIds = properties.map((p: any) => p._id);

  const cars = await Car.find({ ownerId: hostId }).select('_id');
  const carIds = cars.map((c: any) => c._id);

  // 3. Reusable Aggregation Pipeline Factory 
  const buildPipeline = (assetIdField: string, assetIds: any[], completedStatuses: string[]) => [
    { 
      $match: { 
        [assetIdField]: { $in: assetIds }, 
        paymentStatus: 'SUCCESS', // Base requirement: Only paid bookings
        createdAt: { $gte: startOfYear, $lte: endOfYear } // Current year scope
      } 
    },
    {
      $group: {
        _id: { $month: "$createdAt" }, // Group by MongoDB's native month extraction (1-12)
        grossVolume: { $sum: "$totalAmount" },
        bookingCount: { $sum: 1 },
        pendingVolume: { 
          // Match 'HELD_IN_ESCROW' exact enum value
          $sum: { $cond: [{ $eq: ["$payoutStatus", "HELD_IN_ESCROW"] }, "$totalAmount", 0] } 
        },
        completedVolume: { 
          // Dynamically check against the specific completed enums ('RELEASED_TO_LANDLORD' or 'RELEASED_TO_OWNER')
          $sum: { $cond: [{ $in: ["$payoutStatus", completedStatuses] }, "$totalAmount", 0] } 
        }
      }
    }
  ];

  // 4. Execute Mongoose Pipelines concurrently
  const [propStats, carStats] = await Promise.all([
    Reservation.aggregate(buildPipeline('propertyId', propertyIds, ['RELEASED_TO_LANDLORD'])),
    CarReservation.aggregate(buildPipeline('carId', carIds, ['RELEASED_TO_OWNER']))
  ]);

  // 5. Initialize the standard 12-month format for the frontend chart (Jan = 0, Dec = 11)
  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, // Store as 1-12 for the frontend
    totalEarnings: 0,
    pendingPayouts: 0,
    completedPayouts: 0,
    bookings: 0
  }));

  let totalAllTimeEarnings = 0;
  let totalPendingPayouts = 0;
  let totalCompletedPayouts = 0;
  let totalBookingsCount = 0;

  // 6. Merge Data and Apply the 5% Platform Deduction Rule
  const processStats = (stats: any[]) => {
    stats.forEach(stat => {
      const monthIndex = stat._id - 1; // Align MongoDB month (1-12) to JS array (0-11)
      
      // 💡 TYPESCRIPT FIX: Assign to a variable and check if it exists
      const monthData = monthlyData[monthIndex];
      if (!monthData) return; // Satisfies TypeScript's 'Object is possibly undefined'

      // 💡 BUSINESS LOGIC: Host receives 95% of the totalAmount
      const netEarnings = Math.floor(stat.grossVolume * 0.95);
      const netPending = Math.floor(stat.pendingVolume * 0.95);
      const netCompleted = Math.floor(stat.completedVolume * 0.95);

      // Mutate the specific month's data safely
      monthData.totalEarnings += netEarnings;
      monthData.pendingPayouts += netPending;
      monthData.completedPayouts += netCompleted;
      monthData.bookings += stat.bookingCount;

      // Add to aggregate global summary
      totalAllTimeEarnings += netEarnings;
      totalPendingPayouts += netPending;
      totalCompletedPayouts += netCompleted;
      totalBookingsCount += stat.bookingCount;
    });
  };

  processStats(propStats);
  processStats(carStats);

  // 7. Return the finalized payload perfectly formatted for charting
  res.status(200).json({
    status: 'success',
    data: {
      year: currentYear,
      summary: {
        totalEarnings: totalAllTimeEarnings,
        pendingPayouts: totalPendingPayouts,
        completedPayouts: totalCompletedPayouts,
        totalBookings: totalBookingsCount
      },
      chartData: monthlyData
    }
  });
});