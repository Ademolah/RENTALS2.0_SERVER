import { Schema, model } from 'mongoose';
import { ICarReservationDocument } from '../types/index.js';

const carReservationSchema = new Schema<ICarReservationDocument>(
  {
    carId: { type: Schema.Types.ObjectId, ref: 'Car', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pickupTime: { type: Date, required: true },
    dropoffTime: { type: Date, required: true },
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
    guestConfirmedPickup: { type: Boolean, default: false },
    ownerConfirmedHandover: { type: Boolean, default: false },
    escrowStatus: { 
      type: String, 
      enum: ['HELD', 'RELEASED', 'REFUNDED'], 
      default: 'HELD' 
    },
    paystackReference: { type: String, unique: true, sparse: true },
    payoutStatus: { 
      type: String, 
      enum: ['HELD_IN_ESCROW', 'RELEASED_TO_OWNER', 'DIRECT_TO_RENTALS', 'REFUNDED'],
      default: 'HELD_IN_ESCROW'
    },
    isRentalsCar: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Time-series indexing to prevent double-booking race conditions
carReservationSchema.index({ carId: 1, pickupTime: 1, dropoffTime: 1 });

export const CarReservation = model<ICarReservationDocument>('CarReservation', carReservationSchema);