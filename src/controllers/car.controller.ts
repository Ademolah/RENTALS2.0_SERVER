import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Car } from '../models/Car.js';
import { CarService } from '../services/car.service.js';
import { PaystackService } from '../services/paystack.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { CloudinaryService } from '../services/cloudinary.service.js';
import { CarReservation } from '../models/CarReservation.js';
import { EmailService } from '../services/email.service.js';

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

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return next(new AppError('You must upload at least one image of the vehicle.', 400));
  }

  const imageUploadPromises = files.map((file) => 
    CloudinaryService.uploadImageBuffer(file.buffer, 'rentals/cars')
  );
  
  const imageUrls = await Promise.all(imageUploadPromises);

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
  
  const filter: any = {};
  
  if (city) filter['location.city'] = city;
  if (category) filter.category = category;

  const cars = await Car.find(filter).sort({ isAvailable: -1, createdAt: -1 });
  
  console.log(`[DEBUG BACKEND - listCars]: Fetched ${cars.length} cars. Booked cars: ${cars.filter((c) => !c.isAvailable).length}`);

  res.status(200).json({ status: 'success', results: cars.length, data: { cars } });
});

export const listAllCars = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { category, city, minPrice, maxPrice, limit = 10, page = 1, checkIn, checkOut } = req.query;

  const query: any = {};

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

  const cars = await Car.find(query)
    .sort({ isAvailable: -1, createdAt: -1 }) 
    .skip(skip)
    .limit(Number(limit));

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

  if (!carId || !mongoose.Types.ObjectId.isValid(carId as string)) {
    return next(new AppError('Invalid car ID format.', 400));
  }

  const { reservation, totalAmount, paystackReference } = await CarService.createPendingReservation(
    user._id.toString(),
    carId,
    pickupTime,
    dropoffTime
  );

  const metadataPayload = {
    custom_fields: [
      { display_name: "Booking Type", variable_name: "bookingType", value: "CAR" },
      { display_name: "Reservation ID", variable_name: "reservationId", value: reservation._id.toString() },
      { display_name: "Car ID", variable_name: "carId", value: carId.toString() }
    ]
  };

  const paystackData = await PaystackService.initializeTransaction(
    user.email,
    totalAmount,
    metadataPayload,
    paystackReference 
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

export const getCarById = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const carId = req.params.id as string;

  // 💡 FIX 3.4: Catch bad IDs before they crash the server
  if (!carId || !mongoose.Types.ObjectId.isValid(carId)) {
    return next(new AppError('Invalid car ID format.', 400));
  }

  // 💡 FIX 3.3: Exclude sensitive owner info if it gets populated
  const car = await Car.findById(carId)
    .populate('ownerId', 'firstName lastName profilePicture')
    .select('-__v');

  if (!car) {
    return next(new AppError('No vehicle found with that ID', 404));
  }

  // Sanitize internal reservation IDs from bookedDates
  const sanitizedCar = car.toObject();
  if (sanitizedCar.bookedDates) {
    sanitizedCar.bookedDates = sanitizedCar.bookedDates.map((booking: any) => ({
      startDate: booking.startDate,
      endDate: booking.endDate
    })) as any;
  }

  res.status(200).json({
    status: 'success',
    data: { car: sanitizedCar }
  });
});

export const confirmCarHandover = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const reservationId = req.params.reservationId as string;
  const userId = req.user!._id.toString();
  const userRole = req.user!.role;

  // 💡 FIX 3.4: Validate ID
  if (!reservationId || !mongoose.Types.ObjectId.isValid(reservationId)) {
    return next(new AppError('Invalid reservation ID format.', 400));
  }

  const reservation = await CarReservation.findById(reservationId)
    .populate('userId')
    .populate({ 
      path: 'carId', 
      populate: { path: 'ownerId' } 
    });

  if (!reservation) {
    return next(new AppError('Reservation not found', 404));
  }

  if (reservation.paymentStatus !== 'SUCCESS') {
    return next(new AppError('Cannot handover an unpaid reservation', 400));
  }

  const guest = reservation.userId as any;
  const car = reservation.carId as any;
  const owner = car.ownerId as any;

  const isGuest = guest._id.toString() === userId;
  const isOwner = owner._id.toString() === userId || userRole === 'ADMIN';

  if (!isGuest && !isOwner) {
    return next(new AppError('You are not authorized to modify this reservation', 403));
  }

  if (isGuest) reservation.guestConfirmedPickup = true;
  if (isOwner) reservation.ownerConfirmedHandover = true;

  if (reservation.guestConfirmedPickup && reservation.ownerConfirmedHandover && reservation.escrowStatus === 'HELD') {
    reservation.escrowStatus = 'RELEASED';
    reservation.reservationStatus = 'ACTIVE'; 
    console.log(`[ESCROW RELEASED] Car Booking ${reservation._id} funds authorized for payout.`);

   EmailService.sendEscrowRelease({
      guestEmail: guest.email,
      guestName: `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || 'Guest',
      guestPhone: guest.phoneNumber || 'No phone provided',
      
      hostEmail: owner.email,
      hostName: `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || 'Owner',
      hostPhone: owner.phoneNumber || 'No phone provided', 
      
      assetTitle: `${car.make} ${car.carModel} ${car.year}`,
      bookingType: 'CAR',
      amount: reservation.totalAmount, 
      datesOrTime: `${new Date(reservation.pickupTime).toLocaleString()} to ${new Date(reservation.dropoffTime).toLocaleString()}`,
      
      paystackReference: reservation.paystackReference || 'N/A' 
    }).catch(console.error);
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
  const userId = req.user?._id?.toString();

  if (!userId) {
    return next(new AppError('Authentication context missing.', 401));
  }

  const bookings = await CarReservation.find({ userId })
    .populate({
      path: 'carId',
      select: 'make carModel year category location images pricePer12Hours', 
    })
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: bookings.length,
    data: { bookings },
  });
});

export const getLandlordCars = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id?.toString();

  if (!userId) {
    return next(new AppError('You must be logged in to view your cars.', 401));
  }
  
  const cars = await Car.find({ ownerId: userId }).sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: cars.length,
    data: { cars }
  });
});

export const updateCar = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id?.toString();
  const carId = req.params.id as string;

  if (!userId) {
    return next(new AppError('You must be logged in to perform this action.', 401));
  }

  // 💡 FIX 3.4: Validate ID
  if (!carId || !mongoose.Types.ObjectId.isValid(carId)) {
    return next(new AppError('Invalid car ID format.', 400));
  }
  
  let updateData = { ...req.body };

  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    const newUploadedImages = await CloudinaryService.uploadMultipleImages(req.files);
    
    let keptImages = [];
    if (updateData.existingImages) {
      keptImages = Array.isArray(updateData.existingImages) 
        ? updateData.existingImages 
        : JSON.parse(updateData.existingImages); 
    }
    updateData.images = [...keptImages, ...newUploadedImages];
  }

  const car = await Car.findOneAndUpdate(
    { _id: carId, ownerId: userId } as any, 
    updateData, 
    { new: true, runValidators: true }
  );

  if (!car) {
    return next(new AppError('No car found or you do not have permission to edit it.', 404));
  }

  res.status(200).json({ status: 'success', data: { car } });
});

export const getLandlordCarBookings = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id?.toString();

  if (!userId) {
    return next(new AppError('You must be logged in to view your bookings.', 401));
  }

  const landlordCars = await Car.find({ ownerId: userId }).select('_id');
  const carIds = landlordCars.map(c => c._id);

  const bookings = await CarReservation.find({ carId: { $in: carIds } })
    .populate('userId', 'firstName lastName email phoneNumber') 
    .populate('carId', 'make carModel year category images')
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: bookings.length,
    data: { bookings }
  });
});

export const checkCarAvailability = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { startDate, endDate } = req.body;
  const carId = req.params.id as string;

  // 💡 FIX 3.4: Validate ID
  if (!carId || !mongoose.Types.ObjectId.isValid(carId)) {
    return next(new AppError('Invalid car ID format.', 400));
  }

  if (!startDate || !endDate) {
    return next(new AppError('Please provide both startDate and endDate', 400));
  }

  const requestedStart = new Date(startDate);
  const requestedEnd = new Date(endDate);

  if (requestedStart >= requestedEnd) {
    return next(new AppError('Start date must be before end date', 400));
  }

  const car = await Car.findById(carId);

  if (!car) {
    return next(new AppError('No vehicle found with that ID', 404));
  }

  if (!car.isAvailable) {
    return res.status(200).json({ 
      available: false, 
      message: 'This vehicle is currently offline or under maintenance.' 
    });
  }

  const hasOverlap = car.bookedDates.some((booking) => {
    const existingStart = new Date(booking.startDate);
    const existingEnd = new Date(booking.endDate);
    return (requestedStart < existingEnd && requestedEnd > existingStart);
  });

  if (hasOverlap) {
    return res.status(200).json({ 
      available: false, 
      message: 'These dates are already booked. Please select different dates.' 
    });
  }

  res.status(200).json({ 
    available: true, 
    message: 'Vehicle is available for these dates!' 
  });
});