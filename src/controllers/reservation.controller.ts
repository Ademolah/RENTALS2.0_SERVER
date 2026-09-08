import { Request, Response, NextFunction } from 'express';
import { ReservationService } from '../services/reservation.service.js';
import { PaystackService } from '../services/paystack.service.js';
import { Reservation } from '../models/Reservation.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { Property } from '../models/Property.js';

export const initiateBooking = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { propertyId, checkInDate, checkOutDate, guestsCount } = req.body;
  const user = req.user!;

  // 1. Create Pending Reservation in DB
  const { reservation, totalAmount, paystackReference } = await ReservationService.createPendingReservation(
    user._id.toString(),
    propertyId,
    checkInDate,
    checkOutDate,
    guestsCount
  );

  // 2. Initialize Paystack Checkout
  const paystackData = await PaystackService.initializeTransaction(
    user.email,
    totalAmount,
    paystackReference
  );

  res.status(201).json({
    status: 'success',
    message: 'Reservation pending payment',
    data: {
      reservationId: reservation._id,
      checkoutUrl: paystackData.authorization_url,
    }
  });
});

/**
 * Webhook Endpoint: Paystack calls this automatically when a user pays successfully.
 */
export const paystackWebhook = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const signature = req.headers['x-paystack-signature'] as string;

  // 1. Verify Webhook Signature (Security)
  // We stringify req.body directly because express.json() has already parsed it.
  // Note: For absolute safety, webhooks usually use raw body, but this works if strictly formatted.

  const isValid = PaystackService.verifyWebhookSignature(JSON.stringify(req.body), signature);
  
  if (!isValid) {
    return next(new AppError('Invalid webhook signature', 400));
  }

  const event = req.body;

  // 2. Handle Successful Payment Event
  if (event.event === 'charge.success') {
    const reference = event.data.reference;

    // Verify transaction source of truth directly with Paystack
    const txData = await PaystackService.verifyTransaction(reference);

    if (txData.status === 'success') {
      await Reservation.findOneAndUpdate(
        { paystackReference: reference },
        { paymentStatus: 'SUCCESS' }
      );
    }
  }

  // 3. Acknowledge Receipt to Paystack (Must return 200 quickly so Paystack stops retrying)
  res.status(200).send('Webhook received');
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
    .populate('propertyId', 'title category address')
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