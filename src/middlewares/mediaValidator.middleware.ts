import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Property } from '../models/Property.js';
import { AppError } from '../utils/AppError.js';

export const validateAndHashMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const images = files?.images || [];
    const video = files?.video?.[0]; // Get the single video if it exists

    // 1. Strict Size Validations
    const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
    const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

    for (const img of images) {
      if (img.size > MAX_IMAGE_SIZE) {
        return next(new AppError(`Image ${img.originalname} exceeds the 5MB size limit.`, 400));
      }
    }

    if (video && video.size > MAX_VIDEO_SIZE) {
      return next(new AppError('Video file exceeds the 50MB limit.', 400));
    }

    // 2. Cryptographic Anti-Duplication Algorithm
    if (images.length > 0) {
      const incomingHashes: string[] = [];

      for (const img of images) {
        // Generate a SHA-256 hash representing the exact binary pixel data of the image
        const hash = crypto.createHash('sha256').update(img.buffer).digest('hex');
        incomingHashes.push(hash);
      }

      // Check the database for any existing property that contains ANY of these image hashes
      const duplicateProperty = await Property.findOne({
        imageHashes: { $in: incomingHashes }
      });

      if (duplicateProperty) {
        return next(new AppError(
          'Security Alert: One or more of these images are already linked to an existing listing on our platform. Duplicate properties are not permitted.', 
          403
        ));
      }

      // 3. Attach hashes to the request body so the controller can save them to the database
      req.body.imageHashes = incomingHashes;
    }

    next();
  } catch (error) {
    next(new AppError('An error occurred while validating media files.', 500));
  }
};