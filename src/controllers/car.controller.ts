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
import { NotificationService } from '../services/notification.service.js'; // 💡 INJECTED

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
  
  // 💡 BULLETPROOF FIX: Initialize filter with the APPROVED lock
  const filter: any = { status: 'APPROVED' };
  
  if (city) filter['location.city'] = city;
  if (category) filter.category = category;

  const cars = await Car.find(filter).sort({ isAvailable: -1, createdAt: -1 });
  
  console.log(`[DEBUG BACKEND - listCars]: Fetched ${cars.length} cars. Booked cars: ${cars.filter((c) => !c.isAvailable).length}`);

  res.status(200).json({ status: 'success', results: cars.length, data: { cars } });
});

export const listAllCars = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { search, category, city, minPrice, maxPrice, limit = 10, page = 1, checkIn, checkOut } = req.query;

  // 💡 BULLETPROOF FIX: Initialize query with the APPROVED lock
  const query: any = { status: 'APPROVED' };

  if (search) {
    query.$or = [
      { make: { $regex: search,$options: 'i' } },
      { carModel: { $regex: search,$options: 'i' } },
      { 'location.city': { $regex: search,$options: 'i' } },
      { 'location.state': { $regex: search,$options: 'i' } }
    ];
  }

  if (city && !search) {
    query['location.city'] = { $regex: new RegExp(city as string, 'i') };
  }

  if (category) query.category = category;

  if (minPrice || maxPrice) {
    query.pricePer12Hours = {};
    if (minPrice) query.pricePer12Hours.$gte = Number(minPrice);
    if (maxPrice) query.pricePer12Hours.$lte = Number(maxPrice);
  }

  if (checkIn && checkOut) {
    const reqStart = new Date(checkIn as string);
    const reqEnd = new Date(checkOut as string);

    query.isAvailable = true; 

    query.bookedDates = {
      $not: {
        $elemMatch: {
          startDate: { $lt: reqEnd },
          endDate: { $gt: reqStart }
        }
      }
    };
  } else if (checkIn || checkOut) {
    query.isAvailable = true;
  }

  const pageNum = parseInt(page as string, 10) || 1;
  let limitNum = parseInt(limit as string, 10) || 10;
  
  if (limitNum > 50) limitNum = 50; 

  const skip = (pageNum - 1) * limitNum;

  const [cars, total] = await Promise.all([
    Car.find(query)
      .sort({ isAvailable: -1, createdAt: -1 }) 
      .skip(skip)
      .limit(limitNum),
    Car.countDocuments(query)
  ]);

  console.log(`[DEBUG BACKEND]: Search Engine hit. Total cars fetched: ${cars.length}. Booked cars count: ${cars.filter((c: any) => c.isAvailable === false).length}`);

  res.status(200).json({
    status: 'success',
    results: cars.length,
    data: { 
      cars,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum)
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

  // 💡 NOTIFICATION INJECTION: Notify the Host that someone initiated a booking (Optional but helpful for visibility)
  const car = await Car.findById(carId).select('ownerId make carModel');
  if (car) {
    await NotificationService.sendPush(
      car.ownerId,
      "New Vehicle Rental! 🚗",
      `${user.firstName || 'A guest'} just initiated a booking for your ${car.make} ${car.carModel}. Waiting for payment.`,
      "NEW_BOOKING",
      reservation._id
    );
  }

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

  if (!carId || !mongoose.Types.ObjectId.isValid(carId)) {
    return next(new AppError('Invalid car ID format.', 400));
  }

  const car = await Car.findById(carId)
    .populate('ownerId', 'firstName lastName profilePicture')
    .select('-__v');

  if (!car) {
    return next(new AppError('No vehicle found with that ID', 404));
  }

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

  if (isGuest) {
    reservation.guestConfirmedPickup = true;
    // 💡 NOTIFICATION INJECTION: Notify Host that Guest confirmed pickup
    await NotificationService.sendPush(
      owner._id,
      "Pickup Confirmed! 🔑",
      `${guest.firstName} has confirmed receiving the ${car.make}.`,
      "PICKUP",
      reservation._id
    );
  }
  
  if (isOwner) {
    reservation.ownerConfirmedHandover = true;
    // 💡 NOTIFICATION INJECTION: Notify Guest that Host confirmed handover
    await NotificationService.sendPush(
      guest._id,
      "Vehicle Handed Over! 🚗",
      `The host has confirmed the handover of the ${car.make}. Drive safely!`,
      "PICKUP",
      reservation._id
    );
  }

  if (reservation.guestConfirmedPickup && reservation.ownerConfirmedHandover && reservation.escrowStatus === 'HELD') {
    reservation.escrowStatus = 'RELEASED';
    reservation.reservationStatus = 'ACTIVE'; 
    console.log(`[ESCROW RELEASED] Car Booking ${reservation._id} funds authorized for payout.`);

    // 💡 NOTIFICATION INJECTION: Notify Host that Escrow is released
    await NotificationService.sendPush(
      owner._id,
      "Payout Authorized 💰",
      `The escrow for ${car.make} has been released. The funds will settle shortly.`,
      "PAYOUT",
      reservation._id
    );

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