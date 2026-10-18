import { Schema, model } from 'mongoose';
import { IReservationDocument } from '../types/index.js';

const reservationSchema = new Schema<IReservationDocument>(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    
    roomTypeId: { type: Schema.Types.ObjectId }, 
    
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    
    category: {
      type: String,
      // 💡 FIX: Added VIP and VIP_SERVICE to support the unified controller
      enum: ['SHORTLET', 'HOTEL', 'VIP_RESERVATION', 'VIP', 'VIP_SERVICE'],
      default: 'SHORTLET'
    },

    checkInDate: { type: Date, required: true },
    checkOutDate: { type: Date, required: true },
    
    expectedArrivalTime: { type: String },

    totalAmount: { type: Number, required: true, min: 0 },
    paymentStatus: { 
      type: String, 
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'], 
      default: 'PENDING' 
    },
    reservationStatus: { 
      type: String, 
      // 💡 FIX: Added WHATSAPP_INITIATED for the audit trail
      enum: ['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'WHATSAPP_INITIATED'], 
      default: 'ACTIVE' 
    },
    checkInConfirmedByGuest: { type: Boolean, default: false },
    checkInConfirmedByLandlord: { type: Boolean, default: false },
    payoutStatus: { 
      type: String, 
      // 💡 FIX: Added REFUND_PENDING to support your cancellation logic
      enum: ['HELD_IN_ESCROW', 'RELEASED_TO_LANDLORD', 'DIRECT_TO_RENTALS', 'REFUNDED', 'REFUND_PENDING'],
      default: 'HELD_IN_ESCROW'
    },
    isRentalsProperty: { type: Boolean, default: false },
    paystackReference: { type: String, unique: true, sparse: true }, 
    guestsCount: { type: Number, required: true, min: 1 },
  },
   { timestamps: true }
);

reservationSchema.index({ propertyId: 1, roomTypeId: 1, checkInDate: 1, checkOutDate: 1 });
reservationSchema.index({ userId: 1, reservationStatus: 1 });

export const Reservation = model<IReservationDocument>('Reservation', reservationSchema);