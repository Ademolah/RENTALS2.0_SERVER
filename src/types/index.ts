import { Schema, Document, Types } from 'mongoose';
import mongoose from 'mongoose';

// --- ENUMS & LITERALS ---
export type UserRole = 'USER' | 'LANDLORD' | 'ADMIN'; 
export type PropertyCategory = 'CAR RENTAL' | 'SHORTLET' | 'VIP RESERVATION' | 'HOTEL';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
export type ReservationStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

// --- DOMAIN INTERFACES ---

export type PayoutStatus = 'HELD_IN_ESCROW' | 'RELEASED_TO_LANDLORD' | 'DIRECT_TO_RENTALS' | 'REFUNDED';

export type CarCategory = 'LUXURY' | 'SUV' | 'SEDAN' | 'CHAUFFEUR_DRIVEN' | 'VAN';
export type Transmission = 'AUTOMATIC' | 'MANUAL';



// 1. Define the Room Type Interface
export interface IRoomType {
  _id?: Types.ObjectId;
  name: string;             // e.g., "Executive Suite"
  pricePerNight: number;
  capacity: {
    adults: number;
    children: number;
  };
  totalInventory: number;   // e.g., 5 rooms available in the physical building
  amenities: string[];
  images: string[];
  description?: string;
}

// 2. Define the Sub-schema
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

export interface ICar {
  make: string;
  carModel: string;
  year: number;
  category: CarCategory;
  transmission: Transmission;
  ownerId: Types.ObjectId; 
  pricePer12Hours: number;
  currency: string;
  location: {
    city: string;
    state: string;
    address?: string;
  };
  description: string;
  seatNumber: string;
  features: string[]; 
  images: string[];
  isAvailable: boolean;
  bookedDates: {
    startDate: Date;
    endDate: Date;
    reservationId?: Types.ObjectId;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ICarReservation {
  carId: Types.ObjectId;
  userId: Types.ObjectId;
  pickupTime: Date;
  dropoffTime: Date;
  guestConfirmedPickup: boolean;
  ownerConfirmedHandover: boolean; 
  escrowStatus: 'HELD' | 'RELEASED' | 'REFUNDED'; 
  totalAmount: number;
  paymentStatus: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  reservationStatus: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  paystackReference?: string;
  payoutStatus: 'HELD_IN_ESCROW' | 'RELEASED_TO_OWNER' | 'DIRECT_TO_RENTALS' | 'REFUNDED';
  isRentalsCar: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBankDetails {
  accountName: string;
  accountNumber: string; 
  bankName: string;
  bankCode: string;
  recipientCode: string;
  isVerified: boolean;
}

export interface IUser {
  email: string;
  passwordHash: string;
  firstName: string;
  favoriteProperties: mongoose.Types.ObjectId[];
  lastName: string;
  role: UserRole;
  bankDetails: IBankDetails;
  phoneNumber?: string; 
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProperty {
  title: string;
  description: string;
  category: PropertyCategory;
  ownerId: Types.ObjectId; 
  startingPrice?: number;
  hasBreakfast?: boolean;
  roomTypes?: IRoomType[];
  pricePerNight: number;
  currency: string; 
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    coordinates?: { lat: number; lng: number };
  };
  amenities: string[];
  images: string[]; 
  isAvailable: boolean;
  nextAvailableDate?: Date;
  bookedDates: {
    startDate: Date;
    endDate: Date;
    reservationId?: Types.ObjectId;
  }[];
  maxGuests: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReservation {
  propertyId: Types.ObjectId; 
  userId: Types.ObjectId;     
  checkInDate: Date;
  checkOutDate: Date;
  roomTypeId?: Types.ObjectId;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  reservationStatus: ReservationStatus;
  paystackReference?: string; 
  checkInConfirmedByGuest: boolean;
  checkInConfirmedByLandlord: boolean;
  payoutStatus: PayoutStatus;
  isRentalsProperty: boolean; 
  guestsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Mongoose Document Types (Combines our interfaces with Mongoose properties)
export interface IUserDocument extends IUser, Document {}
export interface IPropertyDocument extends IProperty, Document {}
export interface IReservationDocument extends IReservation, Document {}
export interface ICarDocument extends ICar, Document {}
export interface ICarReservationDocument extends ICarReservation, Document {}