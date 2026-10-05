import { Request, Response, NextFunction } from 'express';
import { CloudinaryService } from '../services/cloudinary.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Property } from '../models/Property.js';
import { Reservation } from '../models/Reservation.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

// ==========================================
// 1. CREATE VIP ESTABLISHMENT
// ==========================================

export const createVipEstablishment = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const {
    title, description, establishmentType, depositAmount,
    street, city, state, dressCode, open, close, daysOpen, services
  } = req.body;

  const allowedStates = ['Lagos', 'Abuja', 'Federal Capital Territory'];
  if (!allowedStates.includes(state)) {
    return next(new AppError('VIP Establishments are currently restricted to Lagos and Abuja.', 400));
  }

  // 1. Match Cloudinary implementation from property.controller
  const files = req.files as Express.Multer.File[];
  let images: string[] = [];
  
  if (files && files.length > 0) {
    images = await CloudinaryService.uploadMultipleImages(files);
  } else {
    return next(new AppError('High-quality establishment images are required.', 400));
  }

  // 2. Safe parsing for JSON strings coming from FormData
  let parsedDaysOpen = daysOpen;
  if (typeof daysOpen === 'string') {
    try { parsedDaysOpen = JSON.parse(daysOpen); } catch(e) { parsedDaysOpen = []; }
  }

  let parsedServices = services;
  if (typeof services === 'string') {
    try { parsedServices = JSON.parse(services); } catch(e) { parsedServices = []; }
  }

  // 3. Build the establishment payload step-by-step
  // This satisfies 'exactOptionalPropertyTypes' by omitting 'ownerId' instead of passing 'undefined'
  const establishmentPayload: any = {
    title,
    description,
    category: 'VIP RESERVATION',
    establishmentType,
    pricePerNight: Number(depositAmount),
    depositAmount: Number(depositAmount),
    address: { street, city, state, country: 'Nigeria' },
    dressCode,
    openHours: {
      open,
      close,
      daysOpen: parsedDaysOpen
    },
    services: parsedServices,
    images
  };

  // 4. Inject ownerId only if the user is authenticated
  if (req.user?._id) {
    establishmentPayload.ownerId = req.user._id;
  } else {
    return next(new AppError('Authentication required to create a VIP establishment.', 401));
  }

  // 5. Create the record in the database
  const establishment = await Property.create(establishmentPayload);

  res.status(201).json({
    status: 'success',
    message: 'VIP Establishment created successfully.',
    data: { establishment }
  });
});


// ==========================================
// 2. GET ALL VIP ESTABLISHMENTS
// ==========================================
export const getVipEstablishments = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const establishments = await Property.find({ category: 'VIP RESERVATION' })
    .select('-bookedDates') 
    .sort('-createdAt'); // Match mongoose sort syntax

  res.status(200).json({
    status: 'success',
    results: establishments.length,
    data: { establishments }
  });
});

// ==========================================
// 3. INITIATE VIP RESERVATION & DEPOSIT ESCROW
// ==========================================
export const initiateVipReservation = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { establishmentId, reservationDate, guestCount, arrivalTime } = req.body;
  const currentUserId = req.user?._id;

  if (!currentUserId) {
    return next(new AppError('Authentication context missing.', 401));
  }

  const establishment = await Property.findById(establishmentId);
  if (!establishment || establishment.category !== 'VIP RESERVATION') {
    return next(new AppError('Establishment not found or is not a VIP venue.', 404));
  }

  const guest = await User.findById(currentUserId);
  const host = await User.findById(establishment.ownerId);

  if (!guest || !host) {
    return next(new AppError('User account records not found.', 404));
  }

  const deposit = establishment.depositAmount || 0;
  const platformFee = Math.round(deposit * 0.05);
  const grandTotal = deposit + platformFee;

  // Swapped 'status' for 'reservationStatus'
  const reservation = await Reservation.create({
    propertyId: establishment._id,
    userId: currentUserId,
    checkInDate: reservationDate, 
    checkOutDate: reservationDate, 
    guestsCount: guestCount,
    totalAmount: grandTotal,
    reservationStatus: 'PENDING' 
  });

  // Mock Paystack URL initialization
  const paystackData = { authorization_url: 'https://checkout.paystack.com/mock-url' };

  console.log(`\n=========================================`);
  console.log(`📧 SIMULATED EMAIL TO GUEST (${guest.email}):`);
  console.log(`Subject: Your VIP Request at ${establishment.title} is Pending Payment`);
  console.log(`Body: Please complete your deposit of ₦${grandTotal.toLocaleString()} to secure your table for ${guestCount} guests at ${arrivalTime}. Your funds are held securely in platform escrow until you arrive.`);
  
  console.log(`\n📧 SIMULATED EMAIL TO HOST (${host.email}):`);
  console.log(`Subject: New VIP Reservation Request Initiated`);
  console.log(`Body: ${guest.firstName} is currently securing a deposit for ${guestCount} guests at ${arrivalTime} on ${reservationDate}. We will notify you once the escrow is funded.`);
  console.log(`=========================================\n`);

  res.status(200).json({
    status: 'success',
    message: 'Reservation initiated. Proceed to payment.',
    data: {
      checkoutUrl: paystackData.authorization_url,
      reservationId: reservation._id
    }
  });
});