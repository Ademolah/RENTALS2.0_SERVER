import { Schema, model } from 'mongoose';
import { IUserDocument } from '../types/index.js';

const userSchema = new Schema<IUserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false }, // Never return password by default
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    role: { type: String, enum: ['USER', 'LANDLORD', 'ADMIN'], default: 'USER' },
    phoneNumber: { type: String, trim: true },
    // Add this inside your UserSchema definition
    bankDetails: {
      accountName: {
        type: String,
        trim: true,
      },
      accountNumber: {
        type: String,
        trim: true,
        minlength: 10,
        maxlength: 10, // Nigerian NUBAN accounts are exactly 10 digits
      },
      bankName: {
        type: String,
        trim: true,
      },
      bankCode: {
        type: String,
        trim: true,
      },
      recipientCode: {
        type: String,
        trim: true,
      },
      isVerified: {
        type: Boolean,
        default: false,
      }
    },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const User = model<IUserDocument>('User', userSchema);