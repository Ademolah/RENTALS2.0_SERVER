import { Request, Response, NextFunction } from 'express';
import { Car } from '../models/Car.js';
import { CarService } from '../services/car.service.js';
import { PaystackService } from '../services/paystack.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { CloudinaryService } from '../services/cloudinary.service.js';
import { CarReservation } from '../models/CarReservation.js';


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
    seatNumber,
    location,
    description,
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
    description,
    seatNumber,
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
  
  // 1. Initialize an empty filter instead of forcing isAvailable: true
  const filter: any = {};
  
  if (city) filter['location.city'] = city;
  if (category) filter.category = category;

  // 2. Add FOMO sorting: Available cars show first, then sorted by newest
  const cars = await Car.find(filter).sort({ isAvailable: -1, createdAt: -1 });
  
  console.log(`[DEBUG BACKEND - listCars]: Fetched ${cars.length} cars. Booked cars: ${cars.filter((c) => !c.isAvailable).length}`);

  res.status(200).json({ status: 'success', results: cars.length, data: { cars } });
});




export const listAllCars = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // Extract query parameters for homepage filtering (added checkIn/checkOut for future search)
  const { category, city, minPrice, maxPrice, limit = 10, page = 1, checkIn, checkOut } = req.query;

  // 1. Initialize empty query - do NOT force isAvailable: true by default anymore
  const query: any = {};

  // 2. Future-proofing: If the user searches with specific dates, only show available cars
  if (checkIn || checkOut) {
    query.isAvailable = true;
  }

  if (category) query.category = category;
  if (city) query['location.city'] = { $regex: new RegExp(city as string, 'i') };

  if (minPrice || maxPrice) {
    query.pricePer12Hours = {};
    if (minPrice) query.pricePer12Hours.$gte = Number(minPrice);
    if (maxPrice) query.pricePer12Hours.$lte = Number(maxPrice);
  }

  const skip = (Number(page) - 1) * Number(limit);

  // 3. FOMO Sorting: Available cars first (true = 1, false = 0), then newest cars
  const cars = await Car.find(query)
    .sort({ isAvailable: -1, createdAt: -1 }) 
    .skip(skip)
    .limit(Number(limit));

    console.log(`[DEBUG BACKEND]: Total cars fetched: ${cars.length}. Booked cars count: ${cars.filter((c: any) => c.isAvailable === false).length}`)

  const total = await Car.countDocuments(query);

  res.status(200).json({
    status: 'success',
    results: cars.length,
    data: { 
      cars,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit))
      }
    }
  });
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

  // Perfectly aligned with the Webhook's expected metadata structure
  const metadataPayload = {
    custom_fields: [
      {
        display_name: "Booking Type",
        variable_name: "bookingType",
        value: "CAR"
      },
      {
        display_name: "Reservation ID",
        variable_name: "reservationId",
        value: reservation._id.toString()
      },
      {
        display_name: "Car ID",
        variable_name: "carId",
        value: carId.toString()
      }
    ]
  };

  const paystackData = await PaystackService.initializeTransaction(
    user.email,
    totalAmount,
    metadataPayload,
    paystackReference // Ensure your PaystackService accepts this parameter if you generate it locally
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


export const confirmCarHandover = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { reservationId } = req.params;
  const userId = req.user!._id.toString();
  const userRole = req.user!.role;

  const reservation = await CarReservation.findById(reservationId).populate('carId');
  if (!reservation) {
    return next(new AppError('Reservation not found', 404));
  }

  if (reservation.paymentStatus !== 'SUCCESS') {
    return next(new AppError('Cannot handover an unpaid reservation', 400));
  }

  // Determine who is making the request and update their respective flag
  const isGuest = reservation.userId.toString() === userId;
  const isOwner = (reservation.carId as any).ownerId.toString() === userId || userRole === 'ADMIN';

  if (!isGuest && !isOwner) {
    return next(new AppError('You are not authorized to modify this reservation', 403));
  }

  if (isGuest) {
    reservation.guestConfirmedPickup = true;
  }
  
  if (isOwner) {
    reservation.ownerConfirmedHandover = true;
  }

  // The Escrow Release Trigger Logic
  if (reservation.guestConfirmedPickup && reservation.ownerConfirmedHandover && reservation.escrowStatus === 'HELD') {
    
    // Calculate 95% payout (5% platform commission)
    const payoutAmount = Math.round(reservation.totalAmount * 0.95);
    
    // Trigger Paystack Transfer to Landlord/Owner (Requires owner's recipient code)
    // await PaystackService.transferFunds(payoutAmount, (reservation.carId as any).ownerId);
    
    reservation.escrowStatus = 'RELEASED';
    reservation.reservationStatus = 'ACTIVE'; // Car is now officially on the road
  }

  await reservation.save();

  res.status(200).json({
    status: 'success',
    message: reservation.escrowStatus === 'RELEASED' 
      ? 'Handover complete. Funds have been released to the vehicle owner.'
      : 'Handover partially confirmed. Waiting for the other party to confirm.',
    data: {
      guestConfirmed: reservation.guestConfirmedPickup,
      ownerConfirmed: reservation.ownerConfirmedHandover,
      escrowStatus: reservation.escrowStatus
    }
  });
});

export const getMyCarBookings = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // 1. Extract the authenticated user's ID
  const userId = req.user?._id?.toString();

  if (!userId) {
    return next(new AppError('Authentication context missing.', 401));
  }

  // 2. Query reservations belonging to this guest
  const bookings = await CarReservation.find({ userId })
    .populate({
      path: 'carId',
      // Select the critical fields needed for the Guest Dashboard cards
      select: 'make carModel year category location images pricePer12Hours', 
    })
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: bookings.length,
    data: { bookings },
  });
});