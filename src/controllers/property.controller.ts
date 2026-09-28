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



// CREATE HOTEL
export const createHotel = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { 
    title, description, street, city, state, 
    amenities, hasBreakfast, startingPrice 
  } = req.body;

  let parsedRoomTypes = [];
  if (req.body.roomTypes) {
    try {
      parsedRoomTypes = JSON.parse(req.body.roomTypes);
    } catch (error) {
      return next(new AppError('Invalid roomTypes format. Must be a valid JSON string.', 400));
    }
  }

  let parsedAmenities = amenities;
  if (typeof amenities === 'string') {
    try {
      parsedAmenities = JSON.parse(amenities);
    } catch (e) {
      parsedAmenities = amenities.split(',').map((a: string) => a.trim());
    }
  }

  let uploadedImages: string[] = [];
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    uploadedImages = await CloudinaryService.uploadMultipleImages(req.files);
  }

  if (!req.user?._id) {
    return res.status(401).json({ message: "Unauthorized: No user found." });
  }

  const hotel = await Property.create({
    ownerId: req.user?._id,
    category: 'HOTEL',
    title,
    description,
    address: { street, city, state },
    amenities: parsedAmenities,
    hasBreakfast: hasBreakfast === 'true' || hasBreakfast === true,
    startingPrice: Number(startingPrice),
    roomTypes: parsedRoomTypes,
    images: uploadedImages,
    isAvailable: true
  });

  res.status(201).json({
    status: 'success',
    data: { hotel }
  });
});

// UPDATE HOTEL
export const updateHotel = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const hotelId = req.params.id;
  const updates = { ...req.body };

  const hotel = await Property.findById(hotelId);
  if (!hotel) return next(new AppError('Hotel not found', 404));

  const isAdmin = req.user?.role === 'ADMIN';
  const isLandlordOwner = req.user?.role === 'LANDLORD' && hotel.ownerId.toString() === req.user?._id?.toString();

  if (!isAdmin && !isLandlordOwner) {
    return next(new AppError('You do not have permission to edit this hotel.', 403));
  }

  if (updates.roomTypes) updates.roomTypes = JSON.parse(updates.roomTypes);
  if (updates.amenities && typeof updates.amenities === 'string') {
    try { updates.amenities = JSON.parse(updates.amenities); } 
    catch(e) { updates.amenities = updates.amenities.split(',').map((a: string) => a.trim()); }
  }
  if (updates.address) updates.address = JSON.parse(updates.address);
  if (updates.hasBreakfast) updates.hasBreakfast = updates.hasBreakfast === 'true';

  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    const newImages = await CloudinaryService.uploadMultipleImages(req.files);
    let existingImages = updates.existingImages ? JSON.parse(updates.existingImages) : hotel.images;
    updates.images = [...existingImages, ...newImages];
  }

  const updatedHotel = await Property.findByIdAndUpdate(hotelId, updates, { 
    new: true, runValidators: true 
  });

  res.status(200).json({
    status: 'success',
    data: { hotel: updatedHotel }
  });
});

// DELETE HOTEL
export const deleteHotel = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const hotelId = req.params.id;
  
  const hotel = await Property.findById(hotelId);
  if (!hotel) return next(new AppError('Hotel not found', 404));

  const isAdmin = req.user?.role === 'ADMIN';
  const isLandlordOwner = req.user?.role === 'LANDLORD' && hotel.ownerId.toString() === req.user?._id?.toString();

  if (!isAdmin && !isLandlordOwner) {
    return next(new AppError('You do not have permission to delete this hotel.', 403));
  }

  await Property.findByIdAndDelete(hotelId);

  res.status(204).json({
    status: 'success',
    data: null
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

// GET ALL HOTELS

export const getHotels = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // Combine Express query parameters with our strict Hotel category condition
  const queryObj = { ...req.query, category: 'HOTEL' };
  
  // 'as any' safely tells TypeScript to step aside for this MongoDB operation
  const hotels = await Property.find(queryObj as any)
    .sort('-createdAt')
    .select('-__v');

  res.status(200).json({
    status: 'success',
    results: hotels.length,
    data: { hotels }
  });
});

// GET SINGLE HOTEL BY ID
export const getHotel = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const hotelId = req.params.id;

  // Find by ID but guarantee it is actually a hotel
  // The 'as any' bypasses the rigid exactOptionalPropertyTypes validation block
  const hotel = await Property.findOne({ _id: hotelId, category: 'HOTEL' } as any)
    .populate('ownerId', 'firstName lastName email phoneNumber')
    .select('-__v');

  if (!hotel) {
    return next(new AppError('Hotel not found or it belongs to a different category', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { hotel }
  });
});
