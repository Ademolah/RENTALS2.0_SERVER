import { Request, Response, NextFunction } from 'express';
import { PropertyService } from '../services/property.service.js';
import { CloudinaryService } from '../services/cloudinary.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Property } from '../models/Property.js';
import { Reservation } from '../models/Reservation.js';
import { AppError } from '../utils/AppError.js';


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

// Add this below getProperty in src/controllers/property.controller.ts

export const checkPropertyAvailability = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { startDate, endDate } = req.body;
  const propertyId = req.params.id;

  if (!startDate || !endDate) {
    return next(new AppError('Please provide both startDate and endDate', 400));
  }

  const requestedStart = new Date(startDate);
  const requestedEnd = new Date(endDate);

  if (requestedStart >= requestedEnd) {
    return next(new AppError('Start date must be before end date', 400));
  }

  const property = await Property.findById(propertyId);

  if (!property) {
    return next(new AppError('No property found with that ID', 404));
  }

  // Global Kill-Switch Check
  if (!property.isAvailable) {
    return res.status(200).json({ 
      available: false, 
      message: 'This property is currently offline or under maintenance.' 
    });
  }

  // Date Overlap Engine
  const hasOverlap = property.bookedDates.some((booking) => {
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
    message: 'Property is available for these dates!' 
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

// Get incoming bookings for properties owned by the landlord
export const getLandlordBookings = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // 1. Safely extract and stringify the verified user ID from the request
  const userId = req.user?._id?.toString();

  if (!userId) {
    return next(new AppError('Authentication context missing.', 401));
  }

  // 2. Pass the clean string value to the ownerId query mapping
  const landlordProperties = await Property.find({ ownerId: userId }).select('_id');
  const propertyIds = landlordProperties.map((p) => p._id);

  // 3. Find all reservations associated with those property IDs
  const bookings = await Reservation.find({ propertyId: { $in: propertyIds } })
    .populate('userId', 'firstName lastName email phoneNumber')
    // CRITICAL FIX: Added 'images' to the selection projection
    .populate('propertyId', 'title category address images') 
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: bookings.length,
    data: { bookings },
  });
});




export const checkHotelRoomAvailability = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { hotelId, roomTypeId } = req.params;
  const { checkIn, checkOut } = req.query;

  if (!checkIn || !checkOut) {
    return next(new AppError('Check-in and check-out dates are required.', 400));
  }

  const startDate = new Date(checkIn as string);
  const endDate = new Date(checkOut as string);

  // 1. Validate Hotel and Room Type
  const hotel = await Property.findById(hotelId);
  if (!hotel || hotel.category !== 'HOTEL') {
    return next(new AppError('Hotel not found.', 404));
  }

  const roomType = hotel.roomTypes?.find(room => room._id?.toString() === roomTypeId);
  if (!roomType) {
    return next(new AppError('Room type not found in this hotel.', 404));
  }

  // 2. Count overlapping ACTIVE reservations for this specific room

  const filter: any = {
    reservationStatus: 'ACTIVE',
    $and: [
      { checkInDate: { $lt: endDate } },
      { checkOutDate: { $gt: startDate } }
    ]
  };

  // 2. Handle propertyId safely (handling both strings and arrays of strings)
  if (hotelId) {
    filter.propertyId = Array.isArray(hotelId) ? { $in: hotelId } : hotelId;
  }

  // 3. Handle roomTypeId safely
  if (roomTypeId) {
    filter.roomTypeId = Array.isArray(roomTypeId) ? { $in: roomTypeId } : roomTypeId;
  }

  // 4. Run the query
  const overlappingReservationsCount = await Reservation.countDocuments(filter);


  // 3. Calculate remaining inventory
  const availableRoomsLeft = roomType.totalInventory - overlappingReservationsCount;
  const isAvailable = availableRoomsLeft > 0;

  res.status(200).json({
    status: 'success',
    data: {
      available: isAvailable,
      roomsRemaining: availableRoomsLeft > 0 ? availableRoomsLeft : 0,
      message: isAvailable 
        ? `Available! Only ${availableRoomsLeft} left at this price.` 
        : 'Sold out for these dates.'
    }
  });
});