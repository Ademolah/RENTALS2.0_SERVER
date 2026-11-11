import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import {User} from '../models/User';
import {PaystackService} from '../services/paystack.service';
import { Reservation } from '../models/Reservation';
import { CarReservation } from '../models/CarReservation';
import mongoose from 'mongoose'

export const getAvailableBanks = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const banks = await PaystackService.getBanks();
  
  res.status(200).json({
    status: 'success',
    data: { banks },
  });
});

export const verifyBankAccount = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { accountNumber, bankCode } = req.body;

  if (!accountNumber || !bankCode) {
    return next(new AppError('Account number and bank code are required', 400));
  }

  const accountDetails = await PaystackService.resolveAccountNumber(accountNumber, bankCode);

  res.status(200).json({
    status: 'success',
    data: { accountDetails }, // Contains account_name to show the user
  });
});

// payout.controller.ts


export const saveLandlordBankDetails = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { accountNumber, bankCode, bankName, accountName } = req.body;
  
  const userId = (req.user as any)?._id || (req.user as any)?.id; 

  if (!userId) {
    return next(new AppError('Authentication required.', 401));
  }

  if (!accountNumber || !bankCode || !bankName || !accountName) {
    return next(new AppError('All bank parameters are required.', 400));
  }

  const inputNum = String(accountNumber).replace(/[^0-9]/g, '');
  const inputCode = String(bankCode).replace(/[^0-9]/g, '');

  // 1. Resolve account details from Paystack
  const resolvedAccount = await PaystackService.resolveAccountNumber(inputNum, inputCode);
  
  // Create arrays of words from both names, removing extra spaces
  const resolvedNameWords = resolvedAccount.account_name.toLowerCase().split(/\s+/);
  const inputNameWords = String(accountName).trim().toLowerCase().split(/\s+/);

  // Count how many words from the user's input exist in the bank's resolved name
  const matchCount = inputNameWords.filter(word => resolvedNameWords.includes(word)).length;

  // We require at least 2 words (e.g., First Name + Last Name) to match to pass the security check
  if (matchCount < 2) {
    return next(new AppError(`Account name mismatch. Bank returned: ${resolvedAccount.account_name}`, 400));
  }

  // 2. Generate the Recipient Code natively with purified variables
  // IMPORTANT: Always pass the official resolved name to createTransferRecipient, not the user's raw input
  const recipientData = await PaystackService.createTransferRecipient(
    resolvedAccount.account_name, 
    resolvedAccount.account_number, 
    inputCode
  );

  // 3. Save securely to the Landlord's profile using the verified data structures
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      bankDetails: {
        accountName: resolvedAccount.account_name, // Save the official bank name
        accountNumber: inputNum,
        bankName: String(bankName).trim(),
        bankCode: inputCode,
        recipientCode: recipientData.recipient_code, 
        isVerified: true,
      }
    },
    { new: true, runValidators: true }
  );

  res.status(200).json({
    status: 'success',
    message: 'Bank details verified and secured for Escrow payouts.',
    data: { 
      bankDetails: updatedUser?.bankDetails 
    },
  });
});



export const processLandlordPayout = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { bookingId } = req.params;
  const landlordId = req.user?._id?.toString();

  // 1. Dual Lookup: Determine if this is a Property or Car reservation
  let reservation: any = await Reservation.findById(bookingId).populate('propertyId');
  let isCar = false;

  if (!reservation) {
    reservation = await CarReservation.findById(bookingId).populate('carId');
    isCar = true;
  }

  if (!reservation) {
    return next(new AppError('Reservation not found', 404));
  }

  // 2. Validate Ownership via the populated asset
  const asset = isCar ? reservation.carId : reservation.propertyId;
  const ownerId = asset?.ownerId;

  if (!ownerId || ownerId.toString() !== landlordId) {
    return next(new AppError('Unauthorized access to this asset payout', 403));
  }

  // 3. Enforce Idempotency & The Dual Handshake (SECURITY FIX 1)
  if (reservation.payoutStatus !== 'HELD_IN_ESCROW') {
    return next(new AppError(`Payout cannot be processed. Current status: ${reservation.payoutStatus}`, 400));
  }

  // Verify the exact schema field names for check-in confirmation
  const guestHasCheckedIn = isCar ? reservation.guestConfirmedPickup : reservation.checkInConfirmedByGuest;
  if (!guestHasCheckedIn) {
    return next(new AppError('Payout locked. The guest must confirm check-in on their dashboard before funds can be released.', 403));
  }

  // 4. Temporal Lock (SECURITY FIX 2)
  const today = new Date();
  const checkInDate = new Date(isCar ? reservation.pickupTime : reservation.checkInDate);
  
  if (today < checkInDate) {
    return next(new AppError('Payout locked. Escrow funds cannot be released before the reservation start date.', 403));
  }

  // 5. Retrieve Landlord's Recipient Code
  const landlord = await User.findById(landlordId);
  if (!landlord || !landlord.bankDetails?.recipientCode) {
    return next(new AppError('Payout account not configured. Please setup your bank details first.', 400));
  }

  // 6. Financial Mathematics & Integer Sanitization (SECURITY FIX 4)
  const PLATFORM_FEE_PERCENTAGE = 0.05; // 5%
  const grossAmount = reservation.totalAmount;
  const platformFee = grossAmount * PLATFORM_FEE_PERCENTAGE;
  const payoutAmount = Math.round(grossAmount - platformFee); // Sanitize to exact integer for Paystack

  // 7. Atomic Database Transaction (SECURITY FIX 3)
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 7A. Lock the Ledger State FIRST in memory
    if (isCar) {
      reservation.payoutStatus = 'RELEASED_TO_OWNER';
      reservation.escrowStatus = 'RELEASED'; 
      reservation.ownerConfirmedHandover = true;
    } else {
      reservation.payoutStatus = 'RELEASED_TO_LANDLORD';
      reservation.checkInConfirmedByLandlord = true;
    }
    
    // Save to DB within the transaction session
    await reservation.save({ session });

    // 7B. Initiate Paystack Transfer ONLY after DB acknowledges the lock
    const transferReason = `Payout for ${isCar ? 'Vehicle' : 'Property'} Reservation ${reservation._id}`;
    const transferResult = await PaystackService.initiateTransfer(
      payoutAmount, 
      landlord.bankDetails.recipientCode, 
      reservation._id.toString(),
      transferReason
    );

    // If transfer succeeds, commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: 'success',
      message: 'Payout initiated successfully. Funds are en route to your bank account.',
      data: {
        transferCode: transferResult.data.transfer_code,
        netPayout: payoutAmount,
        status: reservation.payoutStatus
      }
    });

  } catch (error) {
    // If the Paystack API fails, OR the DB fails, abort everything to prevent ghost payouts.
    await session.abortTransaction();
    session.endSession();
    return next(new AppError('Payout failed. The transaction was safely rolled back.', 500));
  }
});