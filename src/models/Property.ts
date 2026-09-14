import { Schema, model } from 'mongoose';
import { IPropertyDocument } from '../types/index.js';

const propertySchema = new Schema<IPropertyDocument>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { 
      type: String, 
      enum: ['CAR RENTAL', 'SHORTLET', 'VIP RESERVATION', 'HOTEL'], 
      required: true 
    },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pricePerNight: { type: Number, required: true, min: 0 },
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
    images: [{ type: String }], // Will store S3/Cloudinary URLs later
    isAvailable: { type: Boolean, default: true },
   
    nextAvailableDate: {
      type: Date,
      default: null // <-- Add this!
    },
    maxGuests: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

// Performance Indexes for search queries
propertySchema.index({ 'address.city': 1, 'address.state': 1 });
propertySchema.index({ category: 1, isAvailable: 1 });
propertySchema.index({ pricePerNight: 1 });

export const Property = model<IPropertyDocument>('Property', propertySchema);