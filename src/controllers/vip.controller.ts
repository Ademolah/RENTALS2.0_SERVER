import { Request, Response, NextFunction } from 'express';
import { CloudinaryService } from '../services/cloudinary.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Property } from '../models/Property.js';
import { Reservation } from '../models/Reservation.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { Types } from 'mongoose';
import {PaystackService} from '../services/paystack.service.js'

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



export const initiateVipReservation = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // Extract callbackUrl along with the other payload data
  const { establishmentId, reservationDate, guestCount, arrivalTime, callbackUrl } = req.body;
  const user = req.user as any;

  if (!establishmentId || !reservationDate || !arrivalTime) {
    return next(new AppError('Establishment ID, reservation date, and arrival time are required.', 400));
  }

  const establishment = await Property.findOne({ _id: establishmentId, category: 'VIP RESERVATION' });
  
  if (!establishment) {
    return next(new AppError('VIP Establishment not found', 404));
  }

  // Calculate Escrow Total (Deposit + 5% Platform Fee)
  const depositAmount = establishment.pricePerNight || 0; // mapped earlier during creation
  const platformFee = Math.round(depositAmount * 0.05);
  const totalAmount = depositAmount + platformFee;

  // Bundle everything Paystack needs to send back to the webhook
  const metadata = {
    custom_fields: [
      { display_name: "Property ID", variable_name: "propertyId", value: establishmentId },
      { display_name: "User ID", variable_name: "userId", value: user._id.toString() },
      { display_name: "Check In", variable_name: "checkInDate", value: reservationDate }, 
      { display_name: "Arrival Time", variable_name: "arrivalTime", value: arrivalTime }, 
      { display_name: "Guests", variable_name: "guestsCount", value: guestCount.toString() },
      { display_name: "Booking Type", variable_name: "bookingType", value: "VIP" }
    ]
  };

  // Pass callbackUrl to Paystack (null skips the custom reference so Paystack auto-generates one)
  const paystackData = await PaystackService.initializeTransaction(
    user.email,
    totalAmount,
    metadata,
    null,
    callbackUrl
  );

  res.status(200).json({
    status: 'success',
    message: 'VIP Reservation initiated',
    data: {
      checkoutUrl: paystackData.authorization_url,
    }
  });
});


// --- Add these inside vip.controller.ts ---

// ==========================================
// 4. GET LANDLORD'S VIP ESTABLISHMENTS
// ==========================================
export const getLandlordVipEstablishments = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const landlordId = req.user?._id;

  if (!landlordId) {
    return next(new AppError('Authentication context missing.', 401));
  }

  const establishments = await Property.find({ 
    ownerId: landlordId, 
    category: 'VIP RESERVATION' 
  }).sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: establishments.length,
    data: { establishments }
  });
});

// ==========================================
// 5. GET SINGLE VIP ESTABLISHMENT (For Editing)
// ==========================================
export const getVipEstablishmentById = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;

  // 1. Ensure 'id' is a single string and a valid ObjectId
  if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
    return next(new AppError('Invalid or missing ID format', 400));
  }

  // 2. TypeScript now knows 'id' is definitely a string
  const establishment = await Property.findOne({ 
    _id: new Types.ObjectId(id), 
    category: 'VIP RESERVATION' 
  });

  if (!establishment) {
    return next(new AppError('VIP Establishment not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { establishment }
  });
});


// ==========================================
// 6. UPDATE VIP ESTABLISHMENT
// ==========================================
export const updateVipEstablishment = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const updateData = { ...req.body };

  const establishment = await Property.findById(id);
  
  if (!establishment || establishment.category !== 'VIP RESERVATION') {
    return next(new AppError('Establishment not found', 404));
  }

  // Ensure only the owner or an admin can edit
  const isOwner = establishment.ownerId.toString() === req.user?._id?.toString();
  const isAdmin = req.user?.role === 'ADMIN';

  if (!isOwner && !isAdmin) {
    return next(new AppError('You do not have permission to edit this listing.', 403));
  }

  // Handle parsed JSON fields from FormData
  if (updateData.daysOpen && typeof updateData.daysOpen === 'string') {
    try { updateData.daysOpen = JSON.parse(updateData.daysOpen); } catch(e) {}
  }
  if (updateData.services && typeof updateData.services === 'string') {
    try { updateData.services = JSON.parse(updateData.services); } catch(e) {}
  }

  // Map deposit amount to Mongoose's required pricePerNight field
  if (updateData.depositAmount) {
    updateData.depositAmount = Number(updateData.depositAmount);
    updateData.pricePerNight = updateData.depositAmount;
  }

  // Map open hours
  if (updateData.open || updateData.close || updateData.daysOpen) {
    updateData.openHours = {
      open: updateData.open || establishment.openHours?.open,
      close: updateData.close || establishment.openHours?.close,
      daysOpen: updateData.daysOpen || establishment.openHours?.daysOpen
    };
  }

  // Handle Cloudinary Image Updates
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    const newImages = await CloudinaryService.uploadMultipleImages(req.files);
    let existingImages = updateData.existingImages ? JSON.parse(updateData.existingImages) : establishment.images;
    updateData.images = [...existingImages, ...newImages];
  } else if (updateData.existingImages) {
    updateData.images = JSON.parse(updateData.existingImages);
  }

  const updatedEstablishment = await Property.findByIdAndUpdate(id, updateData, { 
    new: true, runValidators: true 
  });

  res.status(200).json({
    status: 'success',
    data: { establishment: updatedEstablishment }
  });
});

// ==========================================
// 7. LANDLORD CONFIRMS GUEST ARRIVAL
// ==========================================
export const confirmVipArrival = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params; 
  
  const reservation = await Reservation.findById(id);
  
  if (!reservation) {
    return next(new AppError('Reservation not found', 404));
  }

  // Set the exact landlord flag from the schema
  reservation.checkInConfirmedByLandlord = true;

  // Escrow handshake trigger: If guest already confirmed, release funds
  if (reservation.checkInConfirmedByGuest) {
    reservation.payoutStatus = 'RELEASED_TO_LANDLORD';
  }

  await reservation.save();

  res.status(200).json({
    status: 'success',
    message: 'VIP Arrival confirmed successfully',
    data: { reservation }
  });
});