import { Schema, model } from 'mongoose';
import { IReservationDocument } from '../types/index.js';

const reservationSchema = new Schema<IReservationDocument>(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    checkInDate: { type: Date, required: true },
    checkOutDate: { type: Date, required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    paymentStatus: { 
      type: String, 
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'], 
      default: 'PENDING' 
    },
    reservationStatus: { 
      type: String, 
      enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'], 
      default: 'ACTIVE' 
    },
    checkInConfirmedByGuest: { type: Boolean, default: false },
    checkInConfirmedByLandlord: { type: Boolean, default: false },
    payoutStatus: { 
      type: String, 
      enum: ['HELD_IN_ESCROW', 'RELEASED_TO_LANDLORD', 'DIRECT_TO_RENTALS', 'REFUNDED'],
      default: 'HELD_IN_ESCROW'
    },
isRentalsProperty: { type: Boolean, default: false },
    paystackReference: { type: String, unique: true, sparse: true }, // Sparse allows multiple nulls if unpaid
    guestsCount: { type: Number, required: true, min: 1 },
  },
   { timestamps: true }
);

// Indexes to quickly find active bookings for a specific property (prevents double-booking)
reservationSchema.index({ propertyId: 1, checkInDate: 1, checkOutDate: 1 });
reservationSchema.index({ userId: 1, reservationStatus: 1 });

export const Reservation = model<IReservationDocument>('Reservation', reservationSchema);