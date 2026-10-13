import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

// 1. Route to save a phone's push token
export const savePushToken = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { pushToken } = req.body;

  if (!pushToken) {
    return next(new AppError('Push token is required', 400));
  }

  const userId = req.user?._id;
  if (!userId) {
    return next(new AppError('Unauthorized access. User context missing.', 401));
  }

  // Add the token to the user's array only if it doesn't already exist (using $addToSet)
  await User.findByIdAndUpdate(userId, {
    $addToSet: { pushTokens: pushToken }
  });

  res.status(200).json({
    status: 'success',
    message: 'Push token saved successfully'
  });
});

// 2. Route to get a list of past notifications
export const getMyNotifications = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id;
  
  if (!userId) {
    return next(new AppError('Unauthorized access. User context missing.', 401));
  }

  const notifications = await Notification.find({ userId })
    .sort('-createdAt')
    .limit(50); // Hard limit for performance

  const unreadCount = await Notification.countDocuments({ userId, isRead: false });

  res.status(200).json({
    status: 'success',
    results: notifications.length,
    data: {
      unreadCount,
      notifications
    }
  });
});


export const markAsRead = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const notificationId = req.params.id;
  const userId = req.user?._id;

  if (!userId) {
    return next(new AppError('Unauthorized access. User context missing.', 401));
  }

  // 1. Guard against an empty or missing ID parameter
  if (!notificationId) {
    return next(new AppError('Notification ID is required.', 400));
  }

  // 2. Build the query object cleanly without a possible 'undefined' value
  const notification = await Notification.findOne({ 
    _id: notificationId, // Explicitly verified string type now
    userId 
  });

  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  // Update and save
  notification.isRead = true;
  await notification.save();

  res.status(200).json({
    status: 'success',
    data: { notification }
  });
});
