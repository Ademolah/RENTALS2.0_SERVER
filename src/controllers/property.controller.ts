import { Request, Response, NextFunction } from 'express';
import { PropertyService } from '../services/property.service.js';
import { CloudinaryService } from '../services/cloudinary.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';


export const createProperty = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {

  
  const files = req.files as Express.Multer.File[];
  
  // 1. Process Images if they exist
  let imageUrls: string[] = [];
  if (files && files.length > 0) {
    imageUrls = await CloudinaryService.uploadMultipleImages(files);
  }

  // 2. Parse nested address object (FormData sends objects as JSON strings or flattened keys)
  let parsedAddress = req.body.address;
  if (typeof parsedAddress === 'string') {
    parsedAddress = JSON.parse(parsedAddress);
  }

  // 3. Construct Property Data
  const propertyData = {
    ...req.body,
    address: parsedAddress,
    images: imageUrls,
    ownerId: req.user?._id,
  };

  // 4. Delegate to Service Layer
  const property = await PropertyService.createProperty(propertyData);

  res.status(201).json({
    status: 'success',
    data: { property }
  });
});

// ... (Other controller methods simply call PropertyService now instead of Property model)