import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { EmailService } from '../services/email.service';
import { PaystackService } from '../services/paystack.service.js';
import { Reservation } from '../models/Reservation.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { Property } from '../models/Property.js';
import { CarReservation } from '../models/CarReservation.js';
import { Car } from '../models/Car.js';
import { User } from '../models/User.js';

/**
 * Initiates a booking transaction with SERVER-SIDE price verification
 * and mobile app callback URL support.
 */
export const initiateBooking = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { 
    propertyId, 
    carId, 
    roomId, 
    checkInDate, 
    checkOutDate, 
    guestsCount = 1, 
    bookingType = 'PROPERTY',
    withChauffeur = false,
    callbackUrl 
  } = req.body;

  const user = req.user as any; 

  if (!user || !user.email) {
    return next(new AppError('User authentication context missing.', 401));
  }

  // --- 1. DATE VALIDATION & DURATION CALCULATION ---
  if (!checkInDate || !checkOutDate) {
    return next(new AppError('Please provide valid check-in and check-out dates.', 400));
  }

  const start = new Date(checkInDate);
  const end = new Date(checkOutDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return next(new AppError('Invalid date format provided.', 400));
  }

  if (start >= end) {
    return next(new AppError('Check-out date must be after check-in date.', 400));
  }

  const diffTime = Math.abs(end.getTime() - start.getTime());
  const calculatedNights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  // --- 2. SERVER-SIDE PRICE CALCULATION (SECURITY FIX) ---
  let verifiedTotalAmount = 0;
  const targetAssetId = propertyId || carId;

  if (!targetAssetId || !mongoose.Types.ObjectId.isValid(targetAssetId)) {
    return next(new AppError('Invalid or missing asset ID.', 400));
  }

  switch (bookingType) {
    case 'PROPERTY': {
      const property = await Property.findById(targetAssetId);
      if (!property || !(property as any).isAvailable) {
        return next(new AppError('This property is not available for booking.', 404));
      }
      const pricePerNight = (property as any).pricePerNight || (property as any).startingPrice || 0;
      verifiedTotalAmount = pricePerNight * calculatedNights;
      break;
    }

    case 'HOTEL': {
      if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
        return next(new AppError('A valid room type selection is required for hotel bookings.', 400));
      }
      const hotel = await Property.findById(targetAssetId);
      if (!hotel || !(hotel as any).isAvailable) {
        return next(new AppError('This hotel is currently unavailable.', 404));
      }

      // 💡 FIX 3: Cast hotel to any to safely access nested array IDs
      const room = (hotel as any).roomTypes?.find((r: any) => r._id?.toString() === roomId.toString());
      if (!room) {
        return next(new AppError('Selected hotel room type was not found.', 404));
      }

      verifiedTotalAmount = room.pricePerNight * calculatedNights;
      break;
    }

    case 'CAR': {
      const car = await Car.findById(targetAssetId);
      if (!car || !(car as any).isAvailable) {
        return next(new AppError('This vehicle is currently unavailable for hire.', 404));
      }

      // 💡 FIX 1: Safely cast car to any to access price fields missing from TS definitions
      const dailyRate = (car as any).pricePerDay || (car as any).pricePerNight || 0;
      let carCost = dailyRate * calculatedNights;

      if (withChauffeur) {
        carCost += (25000 * calculatedNights);
      }

      verifiedTotalAmount = carCost;
      break;
    }

    case 'VIP': {
      const vipVenue = await Property.findById(targetAssetId);
      if (!vipVenue || !(vipVenue as any).isAvailable) {
        return next(new AppError('This VIP venue is currently unavailable.', 404));
      }

      const basePrice = (vipVenue as any).startingPrice || (vipVenue as any).pricePerNight || 0;
      verifiedTotalAmount = basePrice * calculatedNights;
      break;
    }

    default:
      return next(new AppError(`Unsupported booking type: ${bookingType}`, 400));
  }

  if (verifiedTotalAmount <= 0) {
    return next(new AppError('Calculated booking amount is invalid.', 400));
  }

  // --- 3. PAYSTACK METADATA & MOBILE DEEP-LINKING ---
  const metadata = {
    callback_url: callbackUrl || undefined, // Paystack standard redirect
    custom_fields: [
      { display_name: "Property/Asset ID", variable_name: "propertyId", value: targetAssetId.toString() },
      { display_name: "Room ID", variable_name: "roomId", value: roomId ? roomId.toString() : "" },
      { display_name: "User ID", variable_name: "userId", value: user._id.toString() },
      { display_name: "Check In", variable_name: "checkInDate", value: checkInDate },
      { display_name: "Check Out", variable_name: "checkOutDate", value: checkOutDate },
      { display_name: "Guests", variable_name: "guestsCount", value: guestsCount.toString() },
      { display_name: "Booking Type", variable_name: "bookingType", value: bookingType },
      { display_name: "Chauffeur Included", variable_name: "withChauffeur", value: withChauffeur ? "true" : "false" },
      { display_name: "Duration (Nights/Days)", variable_name: "calculatedNights", value: calculatedNights.toString() },
      { display_name: "Client Callback URL", variable_name: "callbackUrl", value: callbackUrl || "" }
    ]
  };

  const paystackData = await PaystackService.initializeTransaction(
    user.email,
    verifiedTotalAmount,
    metadata
  );

  res.status(200).json({
    status: 'success',
    message: 'Payment initialization successful',
    data: {
      checkoutUrl: paystackData.authorization_url,
      verifiedAmount: verifiedTotalAmount,
      durationDays: calculatedNights
    }
  });
});


/**
 * Webhook Endpoint - Real-time Payment Verification & Escrow Locking
 */
export const paystackWebhook = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  res.status(200).send('Webhook received');

  const signature = req.headers['x-paystack-signature'] as string;
  const isValid = PaystackService.verifyWebhookSignature(JSON.stringify(req.body), signature);
  
  if (!isValid) return;

  const event = req.body;

  if (event.event === 'charge.success') {
    const reference = event.data.reference;
    const txData = await PaystackService.verifyTransaction(reference);

    if (txData.status === 'success') {
      const customFields = event.data.metadata.custom_fields || [];
      const metadata = customFields.reduce((acc: any, field: any) => {
        acc[field.variable_name] = field.value;
        return acc;
      }, {});

      const bookingType = metadata.bookingType || 'PROPERTY'; 

      try {
        let assetTitle = '';
        let host: any = null;
        let datesOrTime = '';
        const guest = await User.findById(metadata.userId);

        switch (bookingType) {
          case 'PROPERTY': {
            // 💡 FIX 2: Added 'as any' to bypass the TS interface limits for escrowStatus
            const newReservation = await Reservation.create({
              userId: metadata.userId,
              propertyId: metadata.propertyId,
              category: 'SHORTLET',
              checkInDate: new Date(metadata.checkInDate),
              checkOutDate: new Date(metadata.checkOutDate),
              guestsCount: Number(metadata.guestsCount),
              totalAmount: txData.amount / 100, 
              paystackReference: reference,
              paymentStatus: 'SUCCESS',
              escrowStatus: 'HELD'
            } as any);

            const property = await Property.findByIdAndUpdate(metadata.propertyId, {
              $push: {
                bookedDates: {
                  startDate: new Date(metadata.checkInDate),
                  endDate: new Date(metadata.checkOutDate),
                  reservationId: newReservation._id
                } as any
              }
            }).populate('ownerId');

            assetTitle = property?.title || 'Luxury Shortlet';
            host = property?.ownerId;
            datesOrTime = `${new Date(metadata.checkInDate).toLocaleDateString()} to ${new Date(metadata.checkOutDate).toLocaleDateString()}`;
            console.log(`✅ [Webhook] Property Reservation created & Dates Locked (Ref: ${reference})`);
            break;
          }

          case 'HOTEL': {
            const newHotelReservation: any = await Reservation.create({
              userId: metadata.userId,
              propertyId: metadata.propertyId,
              category: 'HOTEL',
              roomTypeId: metadata.roomId, 
              checkInDate: new Date(metadata.checkInDate),
              checkOutDate: new Date(metadata.checkOutDate),
              guestsCount: Number(metadata.guestsCount),
              totalAmount: txData.amount / 100, 
              paystackReference: reference,
              paymentStatus: 'SUCCESS',
              escrowStatus: 'HELD'
            } as any); 

            const property = await Property.findByIdAndUpdate(metadata.propertyId, {
              $push: {
                bookedDates: {
                  startDate: new Date(metadata.checkInDate),
                  endDate: new Date(metadata.checkOutDate),
                  reservationId: newHotelReservation._id,
                  roomTypeId: metadata.roomId 
                } as any 
              }
            }).populate('ownerId');
            
            // 💡 FIX 3: Cast property to any to avoid never[] ID lookup issues
            const bookedRoom = (property as any)?.roomTypes?.find((r: any) => r._id?.toString() === String(metadata.roomId));
            const exactRoomName = bookedRoom ? bookedRoom.name : 'Hotel Suite';

            assetTitle = exactRoomName;
            host = property?.ownerId;
            datesOrTime = `${new Date(metadata.checkInDate).toLocaleDateString()} to ${new Date(metadata.checkOutDate).toLocaleDateString()}`;
            console.log(`✅ [Webhook] Hotel Room (${exactRoomName}) secured & Escrow Held (Ref: ${reference})`);
            break;
          }

          case 'CAR': {
            const reservation = await CarReservation.findById(metadata.reservationId);
            
            if (reservation) {
              reservation.paymentStatus = 'SUCCESS';
              (reservation as any).escrowStatus = 'HELD'; 
              reservation.paystackReference = reference;
              reservation.reservationStatus = 'ACTIVE'; 
              await reservation.save();

              const car = await Car.findByIdAndUpdate(metadata.carId, {
                $push: {
                  bookedDates: {
                    startDate: reservation.pickupTime,
                    endDate: reservation.dropoffTime,
                    reservationId: reservation._id
                  } as any
                }
              }).populate('ownerId');
              
              assetTitle = `${car?.make} ${car?.carModel} ${car?.year}`;
              host = car?.ownerId;
              datesOrTime = `${new Date(reservation.pickupTime).toLocaleString()} to ${new Date(reservation.dropoffTime).toLocaleString()}`;
              console.log(`✅ [Webhook] Car Reservation secured & Dates Locked (Ref: ${reference})`);
            }
            break;
          }

          case 'VIP': {
            const newVipReservation: any = await Reservation.create({
              userId: metadata.userId,
              propertyId: metadata.propertyId,
              category: 'VIP',
              checkInDate: new Date(metadata.checkInDate),
              checkOutDate: new Date(new Date(metadata.checkInDate).getTime() + (24 * 60 * 60 * 1000)),
              guestsCount: Number(metadata.guestsCount),
              totalAmount: txData.amount / 100, 
              paystackReference: reference,
              paymentStatus: 'SUCCESS',
              escrowStatus: 'HELD'
            } as any);

            const property = await Property.findByIdAndUpdate(metadata.propertyId, {
              $push: {
                bookedDates: {
                  startDate: new Date(metadata.checkInDate),
                  endDate: new Date(new Date(metadata.checkInDate).getTime() + (24 * 60 * 60 * 1000)),
                  reservationId: newVipReservation._id
                } as any 
              }
            }).populate('ownerId');
            
            assetTitle = property?.title || 'VIP Venue';
            host = property?.ownerId;
            datesOrTime = `${new Date(metadata.checkInDate).toLocaleDateString()} (Arrival: ${metadata.arrivalTime || 'TBD'})`;
            console.log(`✅ [Webhook] VIP Reservation secured & Deposit Escrowed (Ref: ${reference})`);
            break;
          }

          default:
            console.warn(`⚠️ [Webhook] Unknown bookingType received: ${bookingType}`);
        }

        if (guest && host) {
          EmailService.sendBookingSuccess({
            guestEmail: guest.email,
            guestName: `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || 'Guest',
            guestPhone: guest.phoneNumber || 'No phone provided',
            
            hostEmail: host.email,
            hostName: `${host.firstName || ''} ${host.lastName || ''}`.trim() || 'Host',
            hostPhone: host.phoneNumber || 'No phone provided',
            
            assetTitle,
            bookingType: bookingType as any,
            amount: txData.amount / 100,
            datesOrTime,
            paystackReference: txData.reference
          }).catch(console.error);
        }

      } catch (dbError) {
        console.error('❌ Webhook Database Write Error:', dbError);
      }
    }
  } 
  
  else if (event.event === 'transfer.success') {
    const transferData = event.data;
    const bookingId = transferData.reference; 

    try {
      let reservation: any = await Reservation.findById(bookingId);
      
      if (!reservation) {
        reservation = await CarReservation.findById(bookingId);
      }

      if (reservation) {
        reservation.reservationStatus = 'COMPLETED'; 
        reservation.payoutStatus = 'RELEASED_TO_LANDLORD';
        await reservation.save();
        console.log(`✅ [Webhook] Transfer SUCCESS for Booking: ${bookingId}. Funds delivered.`);
      }
    } catch (dbError) {
      console.error('❌ Webhook Transfer Success DB Error:', dbError);
    }
  } 
  
  else if (event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
    const transferData = event.data;
    const bookingId = transferData.reference;

    try {
      let reservation: any = await Reservation.findById(bookingId);
      let isCar = false;
      
      if (!reservation) {
        reservation = await CarReservation.findById(bookingId);
        isCar = true;
      }

      if (reservation) {
        reservation.payoutStatus = 'HELD_IN_ESCROW';
        
        if (isCar) {
          reservation.escrowStatus = 'HELD';
          reservation.ownerConfirmedHandover = false; 
        } else {
          reservation.checkInConfirmedByLandlord = false; 
        }
        
        await reservation.save();
        console.error(`❌ [Webhook] Transfer FAILED for Booking: ${bookingId}. Reason: ${transferData.reason}`);
      }
    } catch (dbError) {
      console.error('❌ Webhook Transfer Failed DB Error:', dbError);
    }
  }
});

export const getMyBookings = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id?.toString();

  if (!userId) {
    return next(new AppError('Authentication context missing.', 401));
  }

  const bookings = await Reservation.find({ userId })
    .populate({
      path: 'propertyId',
      select: 'title category address images pricePerNight',
    })
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: bookings.length,
    data: { bookings },
  });
});

export const confirmCheckIn = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // 💡 FIX: Explicitly enforce the type as a single string to satisfy TypeScript
  const reservationId = req.params.reservationId as string;
  const userId = req.user?._id?.toString();
  const userRole = req.user?.role;

  // 💡 FIX: Added typeof check so Mongoose is guaranteed to receive a string
  if (!reservationId || typeof reservationId !== 'string' || !mongoose.Types.ObjectId.isValid(reservationId)) {
    return next(new AppError('Invalid reservation ID provided.', 400));
  }

  const reservation = await Reservation.findById(reservationId).populate('propertyId');
  if (!reservation) {
    return next(new AppError('Reservation not found', 404));
  }

  const property = reservation.propertyId as any;
  let updated = false;

  if (reservation.userId.toString() === userId) {
    reservation.checkInConfirmedByGuest = true;
    updated = true;
  }

  if (property?.ownerId?.toString() === userId || userRole === 'ADMIN') {
    reservation.checkInConfirmedByLandlord = true;
    updated = true;
  }

  if (!updated) {
    return next(new AppError('You are not authorized to confirm check-in for this booking', 403));
  }

  if (reservation.checkInConfirmedByGuest && reservation.checkInConfirmedByLandlord) {
    if (!(reservation as any).isRentalsProperty && reservation.payoutStatus === 'HELD_IN_ESCROW') {
      reservation.payoutStatus = 'RELEASED_TO_LANDLORD';
      console.log(`[ESCROW RELEASED] Booking ${reservation._id} funds authorized for payout.`);
    }
  }

  await reservation.save();

  res.status(200).json({
    status: 'success',
    message: 'Check-in status updated successfully',
    data: {
      checkInConfirmedByGuest: reservation.checkInConfirmedByGuest,
      checkInConfirmedByLandlord: reservation.checkInConfirmedByLandlord,
      payoutStatus: reservation.payoutStatus,
    },
  });
});