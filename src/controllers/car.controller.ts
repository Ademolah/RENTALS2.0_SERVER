import { Request, Response, NextFunction } from 'express';
import { Car } from '../models/Car.js';
import { CarService } from '../services/car.service.js';
import { PaystackService } from '../services/paystack.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { CloudinaryService } from '../services/cloudinary.service.js';

// Add this to src/controllers/car.controller.ts

export const createCar = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const {
    make,
    carModel,
    year,
    category,
    transmission,
    pricePer12Hours,
    currency,
    location,
    features,
  } = req.body;

  // 1. Handle File Uploads via your existing Streaming Service
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return next(new AppError('You must upload at least one image of the vehicle.', 400));
  }

  // Map through the files and pass the specific 'rentals/cars' folder to your service
  const imageUploadPromises = files.map((file) => 
    CloudinaryService.uploadImageBuffer(file.buffer, 'rentals/cars')
  );
  
  const imageUrls = await Promise.all(imageUploadPromises);

  // 2. Parse Form-Data Strings
  let parsedLocation;
  try {
    parsedLocation = typeof location === 'string' ? JSON.parse(location) : location;
  } catch (err) {
    return next(new AppError('Invalid location format. Must be valid JSON.', 400));
  }

  if (!parsedLocation || !parsedLocation.city || !parsedLocation.state) {
    return next(new AppError('Location (city and state) is strictly required.', 400));
  }

  const parsedFeatures = typeof features === 'string' 
    ? features.split(',').map((f) => f.trim()) 
    : features;

  // 3. Create Database Record
  const newCar = await Car.create({
    make,
    carModel,
    year: Number(year),
    category,
    transmission,
    ownerId: req.user!._id, 
    pricePer12Hours: Number(pricePer12Hours),
    currency: currency || 'NGN',
    location: parsedLocation,
    features: parsedFeatures || [],
    images: imageUrls, 
    isAvailable: true
  });

  res.status(201).json({
    status: 'success',
    message: 'Vehicle listed successfully.',
    data: { car: newCar }
  });
});

export const listCars = asyncHandler(async (req: Request, res: Response) => {
  const { city, category } = req.query;
  const filter: any = { isAvailable: true };
  
  if (city) filter['location.city'] = city;
  if (category) filter.category = category;

  const cars = await Car.find(filter).sort('-createdAt');
  
  res.status(200).json({ status: 'success', results: cars.length, data: { cars } });
});

export const initiateCarBooking = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { carId, pickupTime, dropoffTime } = req.body;
  const user = req.user!;

  const { reservation, totalAmount, paystackReference } = await CarService.createPendingReservation(
    user._id.toString(),
    carId,
    pickupTime,
    dropoffTime
  );

  // ✅ THE CRITICAL FIX: Structure the payload parameters cleanly as a valid object container 
  // and pass the reference to Paystack properly (Paystack accepts reference at the root object profile!)
  const metadataPayload = {
    bookingType: 'CAR_RENTAL',
    reservationId: reservation._id.toString(),
    custom_fields: [
      {
        display_name: "Booking Type",
        variable_name: "booking_type",
        value: "car_rental"
      }
    ]
  };

  // Update the service method invocation to support its design parameters
  // Paystack allows reference at the root level, so we must add it to the signature or body if needed.
  // For your immediate layout setup, let's wrap it right into your service.
  const paystackData = await PaystackService.initializeTransaction(
    user.email,
    totalAmount,
    metadataPayload
  );

  res.status(201).json({
    status: 'success',
    message: 'Car reservation pending payment',
    data: {
      reservationId: reservation._id,
      checkoutUrl: paystackData.authorization_url,
    }
  });
});


// Add this below listCars

export const getCarById = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const car = await Car.findById(req.params.id);

  // Here is exactly where AppError shines in a controller
  if (!car) {
    return next(new AppError('No vehicle found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { car }
  });
});