import { Document, Types } from 'mongoose';

// --- ENUMS & LITERALS ---
export type UserRole = 'USER' | 'LANDLORD' | 'ADMIN'; // 'ADMIN' is for your internal "Rentals" team
export type PropertyCategory = 'CAR RENTAL' | 'SHORTLET' | 'VIP RESERVATION' | 'HOTEL';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
export type ReservationStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

// --- DOMAIN INTERFACES ---

export type PayoutStatus = 'HELD_IN_ESCROW' | 'RELEASED_TO_LANDLORD' | 'DIRECT_TO_RENTALS' | 'REFUNDED';


export type CarCategory = 'LUXURY' | 'SUV' | 'SEDAN' | 'CHAUFFEUR_DRIVEN' | 'VAN';
export type Transmission = 'AUTOMATIC' | 'MANUAL';

export interface ICar {
  make: string;
  carModel: string;
  year: number;
  category: CarCategory;
  transmission: Transmission;
  ownerId: Types.ObjectId; // References User (Landlord/Admin)
  pricePer12Hours: number;
  currency: string;
  location: {
    city: string;
    state: string;
    address?: string;
  };
  features: string[]; // e.g., ['Leather Seats', 'Bluetooth', 'Armored']
  images: string[];
  isAvailable: boolean;
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
  nextAvailableDate?: Date;
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
  checkInConfirmedByGuest: boolean;
  checkInConfirmedByLandlord: boolean;
  payoutStatus: PayoutStatus;
  isRentalsProperty: boolean; // True if listed directly by Rentals Admin
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