import { Document, Types } from 'mongoose';

// --- ENUMS & LITERALS ---
export type UserRole = 'USER' | 'LANDLORD' | 'ADMIN'; // 'ADMIN' is for your internal "Rentals" team
export type PropertyCategory = 'APARTMENT' | 'SHORTLET' | 'VACATION' | 'HOTEL';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
export type ReservationStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

// --- DOMAIN INTERFACES ---

export interface IUser {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phoneNumber?: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProperty {
  title: string;
  description: string;
  category: PropertyCategory;
  ownerId: Types.ObjectId; // References User
  pricePerNight: number;
  currency: string; // e.g., 'NGN' for Paystack
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    coordinates?: { lat: number; lng: number };
  };
  amenities: string[];
  images: string[]; // Array of image URLs
  isAvailable: boolean;
  maxGuests: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReservation {
  propertyId: Types.ObjectId; // References Property
  userId: Types.ObjectId;     // References User (Guest)
  checkInDate: Date;
  checkOutDate: Date;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  reservationStatus: ReservationStatus;
  paystackReference?: string; // Crucial for payment verification later
  guestsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Mongoose Document Types (Combines our interfaces with Mongoose properties)
export interface IUserDocument extends IUser, Document {}
export interface IPropertyDocument extends IProperty, Document {}
export interface IReservationDocument extends IReservation, Document {}