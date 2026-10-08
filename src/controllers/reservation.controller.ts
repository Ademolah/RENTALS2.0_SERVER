import { Request, Response, NextFunction } from 'express';
import {EmailService } from '../services/email.service'
import { PaystackService } from '../services/paystack.service.js';
import { Reservation } from '../models/Reservation.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { Property } from '../models/Property.js';
import { CarReservation } from '../models/CarReservation.js';
import { Car } from '../models/Car.js'
import { User } from '../models/User.js';

export const initiateBooking = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // Added bookingType and roomId to the incoming request payload
  const { propertyId, roomId, checkInDate, checkOutDate, guestsCount, totalAmount, bookingType = 'PROPERTY' } = req.body;
  const user = req.user as any; 

  // Push the new fields into Paystack's metadata so the webhook receives them
  const metadata = {
    custom_fields: [
      { display_name: "Property ID", variable_name: "propertyId", value: propertyId },
      { display_name: "Room ID", variable_name: "roomId", value: roomId || "" },
      { display_name: "User ID", variable_name: "userId", value: user._id.toString() },
      { display_name: "Check In", variable_name: "checkInDate", value: checkInDate },
      { display_name: "Check Out", variable_name: "checkOutDate", value: checkOutDate },
      { display_name: "Guests", variable_name: "guestsCount", value: guestsCount.toString() },
      { display_name: "Booking Type", variable_name: "bookingType", value: bookingType }
    ]
  };

  const paystackData = await PaystackService.initializeTransaction(
    user.email,
    totalAmount,
    metadata
  );

  res.status(200).json({
    status: 'success',
    message: 'Payment initialization successful',
    data: {
      checkoutUrl: paystackData.authorization_url,
    }
  });
});


/**
 * Webhook Endpoint
 */
export const paystackWebhook = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  res.status(200).send('Webhook received');

  const signature = req.headers['x-paystack-signature'] as string;
  const isValid = PaystackService.verifyWebhookSignature(JSON.stringify(req.body), signature);
  
  if (!isValid) return;

  const event = req.body;

  // ==========================================
  // EVENT 1: GUEST PAYMENT SUCCESS (INCOMING)
  // ==========================================
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
        // Variables to collect for the unified email trigger
        let assetTitle = '';
        let host: any = null;
        let datesOrTime = '';
        const guest = await User.findById(metadata.userId);

        switch (bookingType) {
          case 'PROPERTY': {
            const newReservation = await Reservation.create({
              userId: metadata.userId,
              propertyId: metadata.propertyId,
              checkInDate: new Date(metadata.checkInDate),
              checkOutDate: new Date(metadata.checkOutDate),
              guestsCount: Number(metadata.guestsCount),
              totalAmount: txData.amount / 100, 
              paystackReference: reference,
              paymentStatus: 'SUCCESS'
            });

            const property = await Property.findByIdAndUpdate(metadata.propertyId, {
              $push: {
                bookedDates: {
                  startDate: new Date(metadata.checkInDate),
                  endDate: new Date(metadata.checkOutDate),
                  reservationId: newReservation._id
                }
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
            
            assetTitle = property?.title || 'Luxury Hotel Room';
            host = property?.ownerId;
            datesOrTime = `${new Date(metadata.checkInDate).toLocaleDateString()} to ${new Date(metadata.checkOutDate).toLocaleDateString()}`;
            console.log(`✅ [Webhook] Hotel Room Reservation secured & Escrow Held (Ref: ${reference})`);
            break;
          }

          case 'CAR': {
            const reservation = await CarReservation.findById(metadata.reservationId);
            
            if (reservation) {
              reservation.paymentStatus = 'SUCCESS';
              reservation.escrowStatus = 'HELD'; 
              reservation.paystackReference = reference;
              reservation.reservationStatus = 'ACTIVE'; 
              await reservation.save();

              const car = await Car.findByIdAndUpdate(metadata.carId, {
                $push: {
                  bookedDates: {
                    startDate: reservation.pickupTime,
                    endDate: reservation.dropoffTime,
                    reservationId: reservation._id
                  }
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

       
        // --- NEW: FIRE BOOKING NOTIFICATIONS ---
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
            datesOrTime
          }).catch(console.error); // Fire and forget
        }

      } catch (dbError) {
        console.error('❌ Webhook Database Write Error:', dbError);
      }
    }
  } 
  
  // ==========================================
  // EVENT 2: LANDLORD PAYOUT SUCCESS (OUTGOING)
  // ==========================================
  else if (event.event === 'transfer.success') {
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
        reservation.reservationStatus = 'COMPLETED'; 
        await reservation.save();
        console.log(`✅ [Webhook] Transfer SUCCESS for Booking: ${bookingId}. Funds delivered.`);
      }
    } catch (dbError) {
      console.error('❌ Webhook Transfer Success DB Error:', dbError);
    }
  } 
  
  // ==========================================
  // EVENT 3: LANDLORD PAYOUT FAILED (BOUNCED)
  // ==========================================
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
  const { reservationId } = req.params;
  const userId = req.user?._id?.toString();
  const userRole = req.user?.role;

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

  if (property.ownerId.toString() === userId || userRole === 'ADMIN') {
    reservation.checkInConfirmedByLandlord = true;
    updated = true;
  }

  if (!updated) {
    return next(new AppError('You are not authorized to confirm check-in for this booking', 403));
  }

  if (reservation.checkInConfirmedByGuest && reservation.checkInConfirmedByLandlord) {
    if (!reservation.isRentalsProperty && reservation.payoutStatus === 'HELD_IN_ESCROW') {
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