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
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { 
      type: String, 
      enum: ['CAR RENTAL', 'SHORTLET', 'VIP RESERVATION', 'HOTEL'], 
      required: true 
    },

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
    bookedDates: [
      {
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        reservationId: { type: Schema.Types.ObjectId, ref: 'Reservation' }
      }
    ],
    maxGuests: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

// Performance Indexes for search queries
propertySchema.index({ 'address.city': 1, 'address.state': 1 });
propertySchema.index({ category: 1, isAvailable: 1 });
propertySchema.index({ pricePerNight: 1 });

export const Property = model<IPropertyDocument>('Property', propertySchema);