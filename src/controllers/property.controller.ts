import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { PropertyService } from '../services/property.service.js';
import { CloudinaryService } from '../services/cloudinary.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Property } from '../models/Property.js';
import { Reservation } from '../models/Reservation.js';
import { AppError } from '../utils/AppError.js';

export const createProperty = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // 1. Cast files to an object to handle the fields provided by our new upload middleware
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  
  let imageUrls: string[] = [];
  let videoUrl: string | undefined = undefined;

  // 2. Handle Image Uploads
  if (files?.images && files.images.length > 0) {
    imageUrls = await CloudinaryService.uploadMultipleImages(files.images);
  }

  // 3. Handle Video Upload
  if (files?.video && files.video.length > 0) {
    const videoFile = files.video[0];
    
    // Safely check that the element at index 0 is not undefined
    if (videoFile) {
      videoUrl = await CloudinaryService.uploadVideo(videoFile);
    }
  }

  let parsedAddress = req.body.address;
  if (typeof parsedAddress === 'string') {
    parsedAddress = JSON.parse(parsedAddress);
  }

  // 4. Construct payload with Workflow Status and Security Hashes
  const propertyData = {
    ...req.body,
    address: parsedAddress,
    images: imageUrls,
    video: videoUrl,
    imageHashes: req.body.imageHashes, // 💡 Injected by the mediaValidator middleware
    status: 'PENDING',                 // 💡 Hardcoded to ensure it stays hidden until approved
    ownerId: req.user?._id,
  };

  const property = await PropertyService.createProperty(propertyData);

  res.status(201).json({
    status: 'success',
    message: 'Property submitted successfully and is pending admin approval.',
    data: { property }
  });
});

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

export const updateHotel = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const hotelId = req.params.id as string;

  if (!hotelId || !mongoose.Types.ObjectId.isValid(hotelId)) {
    return next(new AppError('Invalid hotel ID format.', 400));
  }

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

export const deleteHotel = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const hotelId = req.params.id as string;
  
  if (!hotelId || !mongoose.Types.ObjectId.isValid(hotelId)) {
    return next(new AppError('Invalid hotel ID format.', 400));
  }

  const hotel = await Property.findById(hotelId);
  if (!hotel) return next(new AppError('Hotel not found', 404));

  const isAdmin = req.user?.role === 'ADMIN';
  const isLandlordOwner = req.user?.role === 'LANDLORD' && hotel.ownerId.toString() === req.user?._id?.toString();

  if (!isAdmin && !isLandlordOwner) {
    return next(new AppError('You do not have permission to delete this hotel.', 403));
  }

  // ==========================================
  // 💡 INJECTED: Clean up Cloudinary Assets
  // ==========================================
  // Consolidate all media attached to this hotel
  const mediaToDelete: string[] = [...(hotel.images || [])];
  
  // Capture the video if a dedicated video field exists
  if ((hotel as any).videoUrl) mediaToDelete.push((hotel as any).videoUrl);
  if ((hotel as any).video) mediaToDelete.push((hotel as any).video);

  if (mediaToDelete.length > 0) {
    await CloudinaryService.deleteMultipleImages(mediaToDelete);
  }
  // ==========================================

  await Property.findByIdAndDelete(hotelId);

  res.status(204).json({
    status: 'success',
    data: null
  });
});

export const getProperties = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const queryObj = { ...req.query };

  // 💡 BULLETPROOF FIX: Lock the public feed to only show APPROVED properties.
  // BUT if a logged-in landlord is requesting their own portfolio, let them see all statuses!
  const requestingUserId = req.user?._id?.toString();
  if (requestingUserId && queryObj.ownerId === requestingUserId) {
    // Do not force 'APPROVED' status. They are viewing their own dashboard.
  } else {
    queryObj.status = 'APPROVED';
  }

  // 💡 AUDIT FIX: Process guest capacity queries using gte operator
  const guestParam = queryObj.guests || queryObj.maxGuests;
  if (guestParam) {
    const numGuests = Number(guestParam);
    if (!isNaN(numGuests)) {
      queryObj.maxGuests = { gte: numGuests } as any;
    }
    delete queryObj.guests; // Remove raw key so query doesn't try exact match
  }

  const { properties, total } = await PropertyService.getProperties(queryObj);

  res.status(200).json({
    status: 'success',
    results: properties.length, 
    totalCount: total,          
    data: { properties }
  });
});

export const getProperty = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const propertyId = req.params.id as string;

  if (!propertyId || !mongoose.Types.ObjectId.isValid(propertyId)) {
    return next(new AppError('Invalid property ID format.', 400));
  }

  const property = await Property.findById(propertyId)
    .populate('ownerId', 'firstName lastName profilePicture') 
    .select('-__v'); 

  if (!property) {
    return next(new AppError('No property found with that ID', 404));
  }

  const sanitizedProperty = property.toObject();
  if (sanitizedProperty.bookedDates) {
    sanitizedProperty.bookedDates = sanitizedProperty.bookedDates.map((booking: any) => ({
      startDate: booking.startDate,
      endDate: booking.endDate
    })) as any;
  }

  res.status(200).json({
    status: 'success',
    data: { property: sanitizedProperty }
  });
});

export const checkPropertyAvailability = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { startDate, endDate } = req.body;
  const propertyId = req.params.id as string;

  if (!propertyId || !mongoose.Types.ObjectId.isValid(propertyId)) {
    return next(new AppError('Invalid property ID format.', 400));
  }

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

  if (!property.isAvailable) {
    return res.status(200).json({ 
      available: false, 
      message: 'This property is currently offline or under maintenance.' 
    });
  }

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

export const updateProperty = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const propertyId = req.params.id as string;

  if (!propertyId || !mongoose.Types.ObjectId.isValid(propertyId)) {
    return next(new AppError('Invalid property ID format.', 400));
  }

  let updateData = { ...req.body };

  if (updateData.address && typeof updateData.address === 'string') {
    updateData.address = JSON.parse(updateData.address);
  }
  if (updateData.capacity && typeof updateData.capacity === 'string') {
    updateData.capacity = JSON.parse(updateData.capacity);
  }

  // 💡 Safely extract the fields object since we use propertyMediaUpload
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  // 1. Handle incoming new images
  if (files?.images && files.images.length > 0) {
    const newUploadedImages = await CloudinaryService.uploadMultipleImages(files.images);
    
    let keptImages = [];
    if (updateData.existingImages) {
      keptImages = Array.isArray(updateData.existingImages) 
        ? updateData.existingImages 
        : JSON.parse(updateData.existingImages);
    }
    updateData.images = [...keptImages, ...newUploadedImages];

    // 💡 Handle hashes if new images were uploaded and validated
    if (req.body.imageHashes) {
      let keptHashes = [];
      if (updateData.existingImageHashes) {
        keptHashes = Array.isArray(updateData.existingImageHashes)
          ? updateData.existingImageHashes
          : JSON.parse(updateData.existingImageHashes);
      }
      updateData.imageHashes = [...keptHashes, ...req.body.imageHashes];
    }
  }

  // 2. 💡 Handle incoming new video
  if (files?.video && files.video.length > 0) {
    const videoFile = files.video[0];
    if (videoFile) {
      updateData.video = await CloudinaryService.uploadVideo(videoFile);
    }
  }

  // Optional: If you want hosts who update their listings to have to be re-approved by the admin, 
  // you can uncomment the following line. If you want them to stay approved, leave it out.
  // updateData.status = 'PENDING';

  const property = await PropertyService.updateProperty(propertyId, updateData);

  if (!property) {
    return next(new AppError('No property found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { property }
  });
});

export const getLandlordBookings = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id?.toString();

  if (!userId) {
    return next(new AppError('Authentication context missing.', 401));
  }

  const landlordProperties = await Property.find({ ownerId: userId }).select('_id');
  const propertyIds = landlordProperties.map((p) => p._id);

  // 💡 We add .lean() here so we can safely overwrite the properties
  const bookings = await Reservation.find({ propertyId: { $in: propertyIds } })
    .populate('userId', 'firstName lastName email phoneNumber')
    .populate('propertyId', 'title category address images') 
    .sort('-createdAt')
    .lean();

  // 💡 INJECTED: Hide guest details from host (Mobile Team Request #4)
  const sanitizedBookings = bookings.map((booking: any) => {
    if (booking.userId) {
      booking.userId = {
        _id: booking.userId._id, // Keep ID for strict app referencing
        firstName: 'Rentals',
        lastName: 'Africa',
        email: 'hidden@rentalsafrica.com',
        phoneNumber: 'Hidden by platform'
      };
    }
    return booking;
  });

  res.status(200).json({
    status: 'success',
    results: sanitizedBookings.length,
    data: { bookings: sanitizedBookings },
  });
});

export const checkHotelRoomAvailability = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const hotelId = req.params.hotelId as string;
  const roomTypeId = req.params.roomTypeId as string;
  const { checkIn, checkOut } = req.query;

  if (!hotelId || !mongoose.Types.ObjectId.isValid(hotelId)) {
    return next(new AppError('Invalid hotel ID format.', 400));
  }

  if (!checkIn || !checkOut) {
    return next(new AppError('Check-in and check-out dates are required.', 400));
  }

  const startDate = new Date(checkIn as string);
  const endDate = new Date(checkOut as string);

  const hotel = await Property.findById(hotelId);
  if (!hotel || hotel.category !== 'HOTEL') {
    return next(new AppError('Hotel not found.', 404));
  }

  const roomType = hotel.roomTypes?.find(room => room._id?.toString() === roomTypeId);
  if (!roomType) {
    return next(new AppError('Room type not found in this hotel.', 404));
  }

  const filter: any = {
    reservationStatus: 'ACTIVE',
    $and: [
      { checkInDate: { $lt: endDate } },
      { checkOutDate: { $gt: startDate } }
    ]
  };

  if (hotelId) {
    filter.propertyId = Array.isArray(hotelId) ? { $in: hotelId } : hotelId;
  }

  if (roomTypeId) {
    filter.roomTypeId = Array.isArray(roomTypeId) ? { $in: roomTypeId } : roomTypeId;
  }

  const overlappingReservationsCount = await Reservation.countDocuments(filter);
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

export const getHotels = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // 💡 FIX: Explicitly cast queryObj to 'any' so TypeScript allows dynamic properties
  const queryObj: any = { ...req.query, category: 'HOTEL' };
  
  // 💡 Allow landlords to see their own pending/rejected hotels
  const requestingUserId = req.user?._id?.toString();
  if (requestingUserId && queryObj.ownerId === requestingUserId) {
    // Leave status as is so they see everything
  } else {
    queryObj.status = 'APPROVED';
  }

  const hotels = await Property.find(queryObj)
    .sort('-createdAt')
    .select('-__v');

  res.status(200).json({
    status: 'success',
    results: hotels.length,
    data: { hotels }
  });
});

export const getHotel = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const hotelId = req.params.id as string;

  if (!hotelId || !mongoose.Types.ObjectId.isValid(hotelId)) {
    return next(new AppError('Invalid hotel ID format.', 400));
  }

  const hotel = await Property.findOne({ _id: hotelId, category: 'HOTEL' } as any)
    .populate('ownerId', 'firstName lastName profilePicture')
    .select('-__v');

  if (!hotel) {
    return next(new AppError('Hotel not found or it belongs to a different category', 404));
  }

  const sanitizedHotel = hotel.toObject();
  if (sanitizedHotel.bookedDates) {
    sanitizedHotel.bookedDates = sanitizedHotel.bookedDates.map((booking: any) => ({
      startDate: booking.startDate,
      endDate: booking.endDate
    })) as any;
  }

  res.status(200).json({
    status: 'success',
    data: { hotel: sanitizedHotel }
  });
});

export const getLandlordHotelBookings = asyncHandler(async (req: Request, res: Response) => {
  const landlordId = (req as any).user._id; 

  const hotelProperties = await Property.find({ 
    ownerId: landlordId, 
    category: 'HOTEL' 
  }).select('_id');
  
  const hotelPropertyIds = hotelProperties.map(p => p._id);

  // 💡 We add .lean() here as well
  const bookings = await Reservation.find({ 
    propertyId: { $in: hotelPropertyIds } 
  })
    .populate('userId', 'firstName lastName phoneNumber')
    .populate('propertyId', 'title address images')
    .sort({ createdAt: -1 })
    .lean();

  // 💡 INJECTED: Hide guest details from host (Mobile Team Request #4)
  const sanitizedBookings = bookings.map((booking: any) => {
    if (booking.userId) {
      booking.userId = {
        _id: booking.userId._id,
        firstName: 'Rentals',
        lastName: 'Africa',
        phoneNumber: 'Hidden by platform'
      };
    }
    return booking;
  });

  res.status(200).json({
    status: 'success',
    results: sanitizedBookings.length,
    data: { bookings: sanitizedBookings }
  });
});

export const confirmHotelCheckIn = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string; 
  
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid reservation ID format.');
  }

  const reservation = await Reservation.findById(id);
  
  if (!reservation) {
    res.status(404);
    throw new Error('Reservation not found');
  }

  reservation.checkInConfirmedByLandlord = true;

  if (reservation.checkInConfirmedByGuest) {
    reservation.payoutStatus = 'RELEASED_TO_LANDLORD';
  }

  await reservation.save();

  res.status(200).json({
    status: 'success',
    message: 'Hotel check-in confirmed successfully',
    data: { reservation }
  });
});

export const getLandlordHotels = asyncHandler(async (req: Request, res: Response) => {
  const landlordId = (req as any).user._id;

  const hotels = await Property.find({ 
    ownerId: landlordId, 
    category: 'HOTEL' 
  }).sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    results: hotels.length,
    data: { hotels }
  });
});

export const getGuestHotelBookings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;

  if (!userId) {
    res.status(401).json({
      status: 'fail',
      message: 'Unauthorized access'
    });
    return;
  }

  const bookings = await Reservation.find({
    userId: userId, 
    type: 'HOTEL' 
  })
  .populate('propertyId')
  .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    data: { bookings }
  });
});

export const guestConfirmHotelCheckIn = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  const userId = req.user?._id;

  if (!userId) {
    return next(new AppError('Unauthorized access', 401));
  }

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError('Invalid reservation ID format', 400));
  }
  
  const reservation = await Reservation.findOne({ 
    _id: id, 
    userId: userId 
  });
  
  if (!reservation) {
    return next(new AppError('Reservation not found or you do not have permission', 404));
  }

  reservation.checkInConfirmedByGuest = true;

  if (reservation.checkInConfirmedByLandlord) {
    reservation.payoutStatus = 'RELEASED_TO_LANDLORD';
  }

  await reservation.save();

  res.status(200).json({
    status: 'success',
    message: 'Check-in confirmed successfully.',
    data: { reservation }
  });
});

export const deleteProperty = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const propertyId = req.params.id as string;

  if (!propertyId || !mongoose.Types.ObjectId.isValid(propertyId)) {
    return next(new AppError('Invalid property ID format.', 400));
  }

  const property = await Property.findById(propertyId);
  
  if (!property) {
    return next(new AppError('No property found with that ID', 404));
  }

  const isAdmin = req.user?.role === 'ADMIN';
  const isOwner = property.ownerId?.toString() === req.user?._id?.toString();

  if (!isAdmin && !isOwner) {
    return next(new AppError('You do not have permission to delete this property.', 403));
  }

  const activeBookingsCount = await Reservation.countDocuments({
    propertyId: propertyId,
    reservationStatus: 'ACTIVE',
    checkOutDate: { $gte: new Date() }
  });

  if (activeBookingsCount > 0) {
    return next(new AppError('Cannot delete this property. It currently has active future reservations.', 400));
  }

  // ==========================================
  // 💡 INJECTED: Clean up Cloudinary Assets
  // ==========================================
  // Consolidate all media attached to this property
  const mediaToDelete: string[] = [...(property.images || [])];
  
  // If your schema uses a separate field for the video (e.g., videoUrl or video), capture it here
  if ((property as any).videoUrl) mediaToDelete.push((property as any).videoUrl);
  if ((property as any).video) mediaToDelete.push((property as any).video);

  if (mediaToDelete.length > 0) {
    await CloudinaryService.deleteMultipleImages(mediaToDelete);
  }
  // ==========================================

  await Property.findByIdAndDelete(propertyId);

  res.status(204).json({
    status: 'success',
    data: null
  });
});