import { Request, Response, NextFunction } from 'express';
import { ReservationService } from '../services/reservation.service.js';
import { PaystackService } from '../services/paystack.service.js';
import { Reservation } from '../models/Reservation.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { Property } from '../models/Property.js';
import { CarReservation } from '../models/CarReservation.js';
import { Car } from '../models/Car.js';


export const initiateBooking = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { propertyId, checkInDate, checkOutDate, guestsCount, totalAmount } = req.body;
  const user = req.user as any; // Bypass TS 'never' type restriction on req.user

  // 1. Bundle data into Paystack Metadata
  const metadata = {
    custom_fields: [
      { display_name: "Property ID", variable_name: "propertyId", value: propertyId },
      { display_name: "User ID", variable_name: "userId", value: user._id.toString() },
      { display_name: "Check In", variable_name: "checkInDate", value: checkInDate },
      { display_name: "Check Out", variable_name: "checkOutDate", value: checkOutDate },
      { display_name: "Guests", variable_name: "guestsCount", value: guestsCount.toString() }
    ]
  };

  // 2. Initialize Paystack Checkout (Pass 3 arguments matching your service)
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
  // 1. Acknowledge Receipt IMMEDIATELY (Paystack requires a 200 OK within seconds)
  res.status(200).send('Webhook received');

  const signature = req.headers['x-paystack-signature'] as string;
  const isValid = PaystackService.verifyWebhookSignature(JSON.stringify(req.body), signature);
  
  if (!isValid) return;

  const event = req.body;

  if (event.event === 'charge.success') {
    const reference = event.data.reference;
    const txData = await PaystackService.verifyTransaction(reference);

    if (txData.status === 'success') {
      
      // Extract bundled metadata
      const customFields = event.data.metadata.custom_fields || [];
      const metadata = customFields.reduce((acc: any, field: any) => {
        acc[field.variable_name] = field.value;
        return acc;
      }, {});

      const bookingType = metadata.bookingType || 'PROPERTY'; 

      try {
        switch (bookingType) {
          
          case 'PROPERTY': {
            // --- 🏠 PROPERTY RESERVATION LOGIC (Preserved perfectly) ---
            await Reservation.create({
              userId: metadata.userId,
              propertyId: metadata.propertyId,
              checkInDate: new Date(metadata.checkInDate),
              checkOutDate: new Date(metadata.checkOutDate),
              guestsCount: Number(metadata.guestsCount),
              totalAmount: txData.amount / 100, 
              paystackReference: reference,
              paymentStatus: 'SUCCESS'
            });

            await Property.findByIdAndUpdate(metadata.propertyId, {
              isAvailable: false,
              nextAvailableDate: new Date(metadata.checkOutDate)
            });
            console.log(`✅ [Webhook] Property Reservation created (Ref: ${reference})`);
            break;
          }

          case 'CAR': {
            // --- 🚗 CAR RESERVATION LOGIC (Upgraded) ---
            // 1. Fetch the pending reservation to access exact dates
            const reservation = await CarReservation.findById(metadata.reservationId);
            
            if (reservation) {
              // 2. Update Reservation Status & Lock Escrow
              reservation.paymentStatus = 'SUCCESS';
              reservation.escrowStatus = 'HELD'; 
              reservation.paystackReference = reference;
              // Ensure it remains ACTIVE
              reservation.reservationStatus = 'ACTIVE'; 
              await reservation.save();

              // 3. Update Car Availability
              await Car.findByIdAndUpdate(metadata.carId, {
                isAvailable: false, 
                // Set the next available date so the UI knows when it frees up
                nextAvailableDate: reservation.dropoffTime 
              });
              
              console.log(`✅ [Webhook] Car Reservation secured (Ref: ${reference})`);
            }
            break;
          }

          case 'HOTEL': {
            // --- 🏨 HOTEL RESERVATION LOGIC (Future-proofed) ---
            console.log(`⏳ [Webhook] Hotel logic placeholder triggered (Ref: ${reference})`);
            // TODO: await HotelReservation.create(...)
            // TODO: await HotelRoom.findByIdAndUpdate(...)
            break;
          }

          case 'VIP': {
            // --- 👑 VIP RESERVATION LOGIC (Future-proofed) ---
            console.log(`⏳ [Webhook] VIP logic placeholder triggered (Ref: ${reference})`);
            // TODO: await VipReservation.create(...)
            // TODO: await VipVenue.findByIdAndUpdate(...)
            break;
          }

          default:
            console.warn(`⚠️ [Webhook] Unknown bookingType received: ${bookingType}`);
        }

        // --- 📨 GLOBAL POST-PAYMENT ACTIONS ---
        // These will fire for ALL successful booking types.
        // TODO: NotificationService.sendBookingEmail(userEmail, receiptData);
        // TODO: NotificationService.sendHostAlert(hostId, "New booking secured");

      } catch (dbError) {
        console.error('❌ Webhook Database Write Error:', dbError);
      }
    }
  }
});



// Get guest's personal booking history
export const getMyBookings = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // 1. Safely extract the stringified user ID
  const userId = req.user?._id?.toString();

  if (!userId) {
    return next(new AppError('Authentication context missing.', 401));
  }

  // 2. Query reservations belonging specifically to this user
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




// Confirm Check-In (Dual Confirmation for Escrow Release)
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

  // Check if caller is the Guest
  if (reservation.userId.toString() === userId) {
    reservation.checkInConfirmedByGuest = true;
    updated = true;
  }

  // Check if caller is the Landlord or Admin
  if (property.ownerId.toString() === userId || userRole === 'ADMIN') {
    reservation.checkInConfirmedByLandlord = true;
    updated = true;
  }

  if (!updated) {
    return next(new AppError('You are not authorized to confirm check-in for this booking', 403));
  }

  // ESCROW TRIGGER: If both parties confirmed check-in
  if (reservation.checkInConfirmedByGuest && reservation.checkInConfirmedByLandlord) {
    if (!reservation.isRentalsProperty && reservation.payoutStatus === 'HELD_IN_ESCROW') {
      // Flag payout as ready for settlement to landlord subaccount
      reservation.payoutStatus = 'RELEASED_TO_LANDLORD';
      
      // Paystack Subaccount Split Transfer trigger will be called here
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