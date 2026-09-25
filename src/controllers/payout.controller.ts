import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import {User} from '../models/User';
import {PaystackService} from '../services/paystack.service';
import { Reservation } from '../models/Reservation';
import { CarReservation } from '../models/CarReservation';

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
  // Handle potential variations in how the ID is attached to the req.user object
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
  
  // Safely extract the owner ID depending on the asset type to satisfy TypeScript
  const ownerId = asset?.ownerId;


  // Protect against undefined and verify authorization
  if (!ownerId || ownerId.toString() !== landlordId) {
    return next(new AppError('Unauthorized access to this asset payout', 403));
  }

  // 3. Enforce Idempotency using exact schema enums
  if (reservation.payoutStatus !== 'HELD_IN_ESCROW') {
    return next(new AppError(`Payout cannot be processed. Current status: ${reservation.payoutStatus}`, 400));
  }

  // 4. Retrieve Landlord's Recipient Code from the nested bankDetails object
  const landlord = await User.findById(landlordId);
  
  // Using optional chaining to drill into the exact location of the code
  if (!landlord || !landlord.bankDetails?.recipientCode) {
    return next(new AppError('Payout account not configured. Please setup your bank details first.', 400));
  }

  // 5. Financial Mathematics
  const PLATFORM_FEE_PERCENTAGE = 0.05; // 10%
  const grossAmount = reservation.totalAmount;
  const platformFee = grossAmount * PLATFORM_FEE_PERCENTAGE;
  const payoutAmount = grossAmount - platformFee;

  // 6. Initiate Paystack Transfer
  const transferReason = `Payout for ${isCar ? 'Vehicle' : 'Property'} Reservation ${reservation._id}`;
  
  const transferResult = await PaystackService.initiateTransfer(
    payoutAmount, 
    landlord.bankDetails.recipientCode, // Targeted exact schema path
    reservation._id.toString(),
    transferReason
  );

  // 7. Lock the Ledger State using exact schema enums
  if (isCar) {
    reservation.payoutStatus = 'RELEASED_TO_OWNER';
    reservation.escrowStatus = 'RELEASED'; 
    reservation.ownerConfirmedHandover = true;
  } else {
    reservation.payoutStatus = 'RELEASED_TO_LANDLORD';
    reservation.checkInConfirmedByLandlord = true;
  }
  
  await reservation.save();

  res.status(200).json({
    status: 'success',
    message: 'Payout initiated successfully. Funds are en route to your bank account.',
    data: {
      transferCode: transferResult.data.transfer_code,
      netPayout: payoutAmount,
      status: reservation.payoutStatus
    }
  });
});