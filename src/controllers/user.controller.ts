import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Toggle a property in/out of favorites
export const toggleFavoriteProperty = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const propertyId = req.params.propertyId;
  const userId = req.user?._id;

  const user = await User.findById(userId);
  if (!user) return next(new AppError('User not found', 404));

  // Check if it's already a favorite
  const isFavorited = user.favoriteProperties.includes(propertyId as any);

  if (isFavorited) {
    // Remove it
    user.favoriteProperties = user.favoriteProperties.filter(id => id.toString() !== propertyId);
  } else {
    // Add it
    user.favoriteProperties.push(propertyId as any);
  }

  // Save without triggering heavy validations
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    isFavorited: !isFavorited,
    message: !isFavorited ? 'Property added to Saved Stays' : 'Property removed from Saved Stays'
  });
});

// Fetch all favorites for the Guest Dashboard
export const getMyFavorites = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id;
  
  // Populate the critical fields needed for the dashboard cards
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