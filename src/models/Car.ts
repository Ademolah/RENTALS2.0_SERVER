import { Schema, model } from 'mongoose';
import { ICarDocument } from '../types/index.js';

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
    location: {
      city: { type: String, required: true },
      state: { type: String, required: true },
      address: { type: String }
    },
    features: [{ type: String }],
    images: [{ type: String }],
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Indexes for high-performance fleet searching
carSchema.index({ 'location.city': 1, 'location.state': 1 });
carSchema.index({ category: 1, isAvailable: 1 });

export const Car = model<ICarDocument>('Car', carSchema);