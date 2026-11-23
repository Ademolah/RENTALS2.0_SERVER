import { Schema, Document, Types } from 'mongoose';
import mongoose from 'mongoose';

// --- ENUMS & LITERALS ---
export type UserRole = 'USER' | 'LANDLORD' | 'ADMIN'; 
export type PropertyCategory = 'CAR RENTAL' | 'SHORTLET' | 'VIP RESERVATION' | 'VIP' | 'HOTEL' | 'VIP_SERVICE'; 
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
export type ReservationStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'WHATSAPP_INITIATED';

// --- DOMAIN INTERFACES ---
export type PayoutStatus = 'HELD_IN_ESCROW' | 'RELEASED_TO_LANDLORD' | 'RELEASED_TO_OWNER' | 'DIRECT_TO_RENTALS' | 'REFUNDED' | 'REFUND_PENDING';

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
  imageHashes: string;
  video: string;
  year: number;
  rejectionReason: string;
  status: string;
  category: CarCategory;
  transmission: Transmission;
  ownerId: Types.ObjectId; 
  pricePer12Hours: number;
  currency: string;
  
  // 💡 INJECTED: Mobile App Additions (Coordinates, Arrival Info)
  location: {
    city: string;
    state: string;
    address?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  arrivalNotes?: string;
  arrivalPhotos?: string[];
  
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

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  body: string;
  type: 'NEW_BOOKING' | 'PAYMENT' | 'CHECK_IN' | 'PAYOUT' | 'CANCELLATION' | 'HOST_APPROVAL' | 'SYSTEM' | 'PICKUP';
  relatedId?: mongoose.Types.ObjectId;
  isRead: boolean;
  createdAt: Date;
}

export interface ICarReservation {
  carId: Types.ObjectId;
  userId: Types.ObjectId;
  pickupTime: Date;
  dropoffTime: Date;
  guestConfirmedPickup: boolean;
  ownerConfirmedHandover: boolean; 
  escrowStatus: 'PENDING' | 'HELD' | 'RELEASED' | 'REFUNDED' | 'CANCELLED'; 
  totalAmount: number;
  paymentStatus: PaymentStatus;
  reservationStatus: ReservationStatus;
  paystackReference?: string;
  payoutStatus: PayoutStatus;
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
  hostDisplayName: string;
  profilePicture?: string;
  verificationCode?: string;
  verificationCodeExpires?: Date;
  role: UserRole;
  bankDetails: IBankDetails;
  phoneNumber?: string; 
  pushTokens: string[];
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProperty {
  title: string;
  description: string;
  category: PropertyCategory;
  rating: number;
  cautionFee: number;
  hostedBy: string;
  status : string;
  video: string;
  rejectionReason: string;
  imageHashes: string[];
  numReviews: number;
  ownerId: Types.ObjectId; 
  startingPrice?: number;
  establishmentType?: string;
  depositAmount?: number;
  openHours?: {
    open: string;
    close: string;
    daysOpen: string[];
  };
  services?: string[];
  dressCode?: string;
  propertyId: string;
  bedrooms?: number;
  bathrooms?: number;
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
  
  // 💡 INJECTED: Mobile App Additions (Check-in/out times, Arrival Info)
  checkInTime?: string;
  checkOutTime?: string;
  arrivalNotes?: string;
  arrivalPhotos?: string[];
  
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
  category?: 'SHORTLET' | 'HOTEL' | 'VIP_RESERVATION' | 'VIP' | 'VIP_SERVICE';
  expectedArrivalTime?: string;
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

// ============================================================================
// --- IN-APP SUPPORT CHAT TYPES & INTERFACES ---
// ============================================================================

export type TicketCategory =
  | 'SHORTLET_CHECKIN'
  | 'CAUTION_FEE_REFUND'
  | 'HOST_PAYOUT'
  | 'CAR_RENTAL_HANDOVER'
  | 'HOTEL_RESERVATION'
  | 'VIP_VENUE_EVENT'
  | 'ACCOUNT_KYC'
  | 'DISPUTE_ESCALATION'
  | 'GENERAL_INQUIRY';

export type TicketStatus =
  | 'OPEN'             // Unassigned in live agent queue
  | 'ASSIGNED'         // Claimed by an admin/support agent
  | 'WAITING_ON_USER'  // Agent replied; awaiting user or landlord action
  | 'RESOLVED'         // Issue resolved; user can reopen within 48h
  | 'CLOSED';          // Permanently locked archive

export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

// Aligned directly with your existing UserRole ('USER' | 'LANDLORD' | 'ADMIN')
export type RequesterRole = 'USER' | 'LANDLORD';
export type MessageSenderRole = 'USER' | 'LANDLORD' | 'ADMIN' | 'SYSTEM';
export type MessageVisibility = 'PUBLIC' | 'INTERNAL_NOTE';

// Polymorphic reference to your existing Rentals Africa models
export type SupportContextType =
  | 'RESERVATION'      // Links to Reservation (Shortlet, Hotel, VIP)
  | 'CAR_RESERVATION'  // Links to CarReservation
  | 'PROPERTY'         // Links to Property (listing approval / payout)
  | 'CAR'              // Links to Car (fleet approval / payout)
  | 'NONE';

export interface IChatAttachment {
  url: string;
  publicId: string;
  mimeType: string;
  fileName?: string;
  sizeBytes?: number;
}

export interface ISupportTicket {
  ticketCode: string;
  requesterId: Types.ObjectId;
  requesterRole: RequesterRole;
  assignedAgentId: Types.ObjectId | null;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  contextType: SupportContextType;
  contextId: Types.ObjectId | null;
  lastMessagePreview: string;
  lastMessageAt: Date;
  requesterUnreadCount: number;
  agentUnreadCount: number;
  internalTags: string[];
  slaFirstResponseAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISupportMessage {
  ticketId: Types.ObjectId;
  clientMessageId: string;
  senderId: Types.ObjectId | null;
  senderRole: MessageSenderRole;
  senderDisplayName: string;
  visibility: MessageVisibility;
  body: string;
  attachments: IChatAttachment[];
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedActor {
  userId: string;
  role: UserRole;
  fullName: string;
}

export interface SanitizedTicketDTO {
  id: string;
  ticketCode: string;
  requesterId: string;
  requesterRole: RequesterRole;
  assignedAgentId: string | null;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  contextType: SupportContextType;
  contextId: string | null;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  internalTags?: string[];
  slaFirstResponseAt?: string | null;
}

export interface SanitizedMessageDTO {
  id: string;
  ticketId: string;
  clientMessageId: string;
  senderId: string | null;
  senderRole: MessageSenderRole;
  senderDisplayName: string;
  visibility: MessageVisibility;
  body: string;
  attachments: IChatAttachment[];
  readAt: string | null;
  createdAt: string;
}

export interface CursorPaginationResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// Mongoose Document & Model Interfaces
export interface ISupportTicketDocument extends ISupportTicket, Document {}
export interface ISupportMessageDocument extends ISupportMessage, Document {}

export interface ISupportTicketModel extends mongoose.Model<ISupportTicket> {
  generateTicketCode(): string;
  toSafeDTO(ticket: ISupportTicketDocument, actor: AuthenticatedActor): SanitizedTicketDTO;
}

export interface ISupportMessageModel extends mongoose.Model<ISupportMessage> {
  toSafeDTO(
    message: ISupportMessageDocument,
    actor: AuthenticatedActor
  ): SanitizedMessageDTO | null;
}

// Mongoose Document Types (Combines our interfaces with Mongoose properties)
export interface IUserDocument extends IUser, Document {}
export interface IPropertyDocument extends IProperty, Document {}
export interface IReservationDocument extends IReservation, Document {}
export interface ICarDocument extends ICar, Document {}
export interface ICarReservationDocument extends ICarReservation, Document {}