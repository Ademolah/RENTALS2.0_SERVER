import { Schema, model } from 'mongoose';
import { ICarDocument } from '../types/index.js';

const arrayLimit = (val: string[]) => val.length <= 5;

const carSchema = new Schema<ICarDocument>(
  {
    make: { type: String, required: true, trim: true },
    carModel: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    category: { 
      type: String, 
      enum: ['LUXURY', 'SUV', 'SEDAN', 'CHAUFFEUR_DRIVEN', 'VAN'], 
      required: true 
    },
    transmission: { type: String, enum: ['AUTOMATIC', 'MANUAL'], required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pricePer12Hours: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'NGN' },
    
    // --- MOBILE APP INJECTIONS ---
    location: {
      city: { type: String, required: true },
      state: { type: String, required: true },
      address: { type: String },
      // Added coordinates directly to the location object
      coordinates: {
        lat: { type: Number },
        lng: { type: Number }
      }
    },
    arrivalNotes: {
      type: String,
      maxlength: [1000, 'Pickup instructions cannot exceed 1000 characters.']
    },
    arrivalPhotos: [{
      type: String,
      validate: [arrayLimit, 'You can only upload a maximum of 5 pickup location photos.']
    }],
    // -----------------------------

    seatNumber: {type: String, required: true},
    description: {
      type: String,
      required: [true, 'Please provide a description of the vehicle']
    },
    status: { 
      type: String, 
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'], 
      default: 'PENDING' 
    },
    features: [{ type: String }],
    images: [{ type: String }],
    imageHashes: [{ type: String }], 
    video: { type: String },         
    isAvailable: { type: Boolean, default: true },
    bookedDates: [
      {
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        reservationId: { type: Schema.Types.ObjectId, ref: 'CarReservation' }
      }
    ],
  },
  { timestamps: true }
);

carSchema.index({ 'location.city': 1, 'location.state': 1 });
carSchema.index({ category: 1, isAvailable: 1 });

export const Car = model<ICarDocument>('Car', carSchema);