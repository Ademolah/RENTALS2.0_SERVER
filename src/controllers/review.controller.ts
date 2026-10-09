import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import Review from '../models/Reviews';
import {Property} from '../models/Property';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';


export const createPropertyReview = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    // 1. Explicitly cast propertyId to string to satisfy Mongoose strict typing
    const propertyId = req.params.propertyId as string;
    const { rating, comment } = req.body;
    
    // 2. Cast req.user to any to bypass the IUserDocument strict matching, 
    // since we only need the _id and role for this logic.
    const user = req.user as any;

    if (!user) {
      throw new AppError('Not authorized to access this route', 401);
    }

    if (user.role !== 'USER') {
      throw new AppError('Only guest accounts can submit reviews.', 403);
    }

    // 3. Validate Property Existence
    const property = await Property.findById(propertyId);
    if (!property) {
      throw new AppError('Property not found.', 404);
    }

    // 4. Prevent Duplicate Reviews
    const alreadyReviewed = await Review.findOne({
      property: propertyId,
      user: user._id,
    });

    if (alreadyReviewed) {
      throw new AppError('You have already reviewed this stay.', 400);
    }

    // 5. Create Review
    const review = await Review.create({
      property: propertyId,
      user: user._id,
      rating: Number(rating),
      comment,
    });

    // 6. Calculate New Average Rating & Number of Reviews using Aggregation
    const stats = await Review.aggregate([
      { $match: { property: new Types.ObjectId(propertyId) } },
      {
        $group: {
          _id: '$property',
          numReviews: { $sum: 1 },
          avgRating: { $avg: '$rating' },
        },
      },
    ]);

    // 7. Update Property Document
    if (stats.length > 0) {
      property.numReviews = stats[0].numReviews;
      property.rating = Math.round(stats[0].avgRating * 10) / 10;
      await property.save();
    }

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully!',
      review,
      updatedPropertyStats: {
        rating: property.rating,
        numReviews: property.numReviews,
      },
    });
  }
);

// @desc    Get all reviews for a property
// @route   GET /api/reviews/:propertyId
// @access  Public
export const getPropertyReviews = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    // Explicitly cast to string to satisfy Mongoose find()
    const propertyId = req.params.propertyId as string;

    const reviews = await Review.find({ property: propertyId })
      .populate('user', 'firstName lastName profilePicture')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      reviews,
    });
  }
);

