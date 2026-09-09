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

export const getProperties = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // ✅ THE CRITICAL FIX: Destructure the properties array and the total count from the service object
  const { properties, total } = await PropertyService.getProperties(req.query);

  res.status(200).json({
    status: 'success',
    results: properties.length, // 💡 TypeScript now recognizes this as a valid array length!
    totalCount: total,          // 💡 You can now safely pass the total database match count to the client
    data: { 
      properties 
    }
  });
});

// --- GET SINGLE PROPERTY CONTROLLER ---
export const getProperty = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // 💡 Add "as string" at the end to satisfy the strict parameter requirements
  const property = await PropertyService.getPropertyById(req.params.id as string);

  if (!property) {
    res.status(404).json({
      status: 'fail',
      message: 'No property found with that ID'
    });
    return; 
  }

  res.status(200).json({
    status: 'success',
    data: { 
      property 
    }
  });
});


// --- UPDATE PROPERTY CONTROLLER ---
export const updateProperty = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // Pass the ID from the URL params, and the update payload from the request body
  const property = await PropertyService.updateProperty(req.params.id as string, req.body);

  if (!property) {
    res.status(404).json({
      status: 'fail',
      message: 'No property found with that ID'
    });
    return;
  }

  res.status(200).json({
    status: 'success',
    data: { 
      property 
    }
  });
});
