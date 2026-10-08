import { Request, Response, NextFunction } from 'express';
import HostRequest from '../models/HostRequest.js';
import {User} from '../models/User.js'; // Adjust to { User } if you use named exports
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
    .populate('user', 'firstName lastName email')
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