import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// --- APP STORE COMPLIANCE ROUTES (Audit Item 4.1) ---

export const getMe = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const user = await User.findById(req.user?._id);
  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({
    status: 'success',
    data: { user }
  });
});

export const updateMe = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // 1. Prevent users from updating sensitive fields via this route
  if (req.body.password || req.body.role || req.body.email) {
    return next(new AppError('This route is not for password, role, or email updates.', 400));
  }

  // 2. Filter allowed fields
  const allowedUpdates = {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    phoneNumber: req.body.phoneNumber,
    profilePicture: req.body.profilePicture,
  };

  // Remove undefined fields so they don't overwrite existing data with nulls
  Object.keys(allowedUpdates).forEach(key => {
    if ((allowedUpdates as any)[key] === undefined) {
      delete (allowedUpdates as any)[key];
    }
  });

  const updatedUser = await User.findByIdAndUpdate(req.user?._id, allowedUpdates, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    status: 'success',
    data: { user: updatedUser }
  });
});

export const deleteMe = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // Strict App Store Requirement: Account Deletion
  await User.findByIdAndDelete(req.user?._id);

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// --- EXISTING FAVORITES ROUTES ---

export const toggleFavoriteProperty = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const propertyId = req.params.propertyId;
  const userId = req.user?._id;

  const user = await User.findById(userId);
  if (!user) return next(new AppError('User not found', 404));

  const isFavorited = user.favoriteProperties.includes(propertyId as any);

  if (isFavorited) {
    user.favoriteProperties = user.favoriteProperties.filter(id => id.toString() !== propertyId);
  } else {
    user.favoriteProperties.push(propertyId as any);
  }

  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    isFavorited: !isFavorited,
    message: !isFavorited ? 'Property added to Saved Stays' : 'Property removed from Saved Stays'
  });
});

export const getMyFavorites = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id;
  
  const user = await User.findById(userId).populate({
    path: 'favoriteProperties',
    select: 'title address pricePerNight images isAvailable nextAvailableDate category maxGuests'
  });

  res.status(200).json({
    status: 'success',
    results: user?.favoriteProperties.length || 0,
    data: {
      favorites: user?.favoriteProperties || []
    }
  });
});