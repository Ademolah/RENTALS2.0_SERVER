import { Document, Types } from 'mongoose';

// --- ENUMS & LITERALS ---
export type UserRole = 'USER' | 'LANDLORD' | 'ADMIN'; 
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