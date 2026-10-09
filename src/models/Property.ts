import { Schema, model } from 'mongoose';
import { IPropertyDocument, IRoomType } from '../types/index.js';

const roomTypeSchema = new Schema<IRoomType>({
  name: { type: String, required: true },
  pricePerNight: { type: Number, required: true },
  capacity: {
    adults: { type: Number, required: true, default: 2 },
    children: { type: Number, required: true, default: 0 }
  },
  totalInventory: { type: Number, required: true, min: 1 },
  amenities: [{ type: String }],
  images: [{ type: String }],
  description: { type: String }
});

const propertySchema = new Schema<IPropertyDocument>(
  {
    // Auto-generated 5-digit ID
    propertyId: { type: String, unique: true },
    
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { 
      type: String, 
      enum: ['CAR RENTAL', 'SHORTLET', 'VIP RESERVATION', 'HOTEL'], 
      required: true 
    },
    rating: {
      type: Number,
      default: 0,
    },
    numReviews: {
      type: Number,
      default: 0,
    },
    startingPrice: { type: Number },
    hasBreakfast: { type: Boolean, default: false },
    roomTypes: {
      type: [roomTypeSchema],
      validate: {
        validator: function(this: any, v: any) {
          if (this.category === 'HOTEL') {
            return v && v.length > 0;
          }
          return true;
        },
        message: 'A Hotel must have at least one room type defined.'
      }
    },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    
    pricePerNight: { 
      type: Number, 
      required: function(this: any) { 
        return this.category === 'SHORTLET' || this.category === 'VIP RESERVATION'; 
      }, 
      min: 0 
    },
    currency: { type: String, default: 'NGN' },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, required: true, default: 'Nigeria' },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number }
      }
    },
    amenities: [{ type: String }],
    images: [{ type: String }], 
    isAvailable: { type: Boolean, default: true },
    nextAvailableDate: {
      type: Date,
      default: null 
    },
    bookedDates: [
      {
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        reservationId: { type: Schema.Types.ObjectId, ref: 'Reservation' },
        roomTypeId: { type: Schema.Types.ObjectId, required: false }
      }
    ],
    maxGuests: { 
      type: Number, 
      required: function(this: any) { 
        return this.category === 'SHORTLET'; 
      }, 
      min: 1 
    },

    establishmentType: {
      type: String,
      enum: ['LOUNGE', 'CLUB', 'FINE_DINING', 'BEACH_CLUB', 'PRIVATE_YACHT', 'OTHER'],
      required: function(this: any) { return this.category === 'VIP RESERVATION'; }
    },
    services: [{ type: String }],
    dressCode: { type: String },
    openHours: {
      open: { type: String },
      close: { type: String },
      daysOpen: [{ type: String }]
    },
    
    // SURGICAL FIX: Bedrooms and Bathrooms for Shortlets
    bedrooms: {
      type: Number,
      required: function(this: any) {
        return this.category === 'SHORTLET';
      },
      min: 1
    },
    bathrooms: {
      type: Number,
      required: function(this: any) {
        return this.category === 'SHORTLET';
      },
      min: 1
    }
  },
  { timestamps: true }
);

// Pre-save middleware to automatically generate a 5-digit propertyId
propertySchema.pre('save', async function () {
  if (!this.propertyId) {
    // Generates a random number between 10000 and 99999
    this.propertyId = Math.floor(10000 + Math.random() * 90000).toString();
  }
});

// Performance Indexes for search queries
propertySchema.index({ 'address.city': 1, 'address.state': 1 });
propertySchema.index({ category: 1, isAvailable: 1 });
propertySchema.index({ pricePerNight: 1 });

export const Property = model<IPropertyDocument>('Property', propertySchema);