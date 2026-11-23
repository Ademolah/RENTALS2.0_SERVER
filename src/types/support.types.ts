import { Types } from 'mongoose';

export enum TicketCategory {
  SHORTLET_CHECKIN = 'SHORTLET_CHECKIN',
  CAUTION_FEE_REFUND = 'CAUTION_FEE_REFUND',
  HOST_PAYOUT = 'HOST_PAYOUT',
  CAR_RENTAL_HANDOVER = 'CAR_RENTAL_HANDOVER',
  HOTEL_RESERVATION = 'HOTEL_RESERVATION',
  VIP_VENUE_EVENT = 'VIP_VENUE_EVENT',
  ACCOUNT_KYC = 'ACCOUNT_KYC',
  DISPUTE_ESCALATION = 'DISPUTE_ESCALATION',
  GENERAL_INQUIRY = 'GENERAL_INQUIRY',
}

export enum TicketStatus {
  OPEN = 'OPEN',                         // Unassigned in live queue
  ASSIGNED = 'ASSIGNED',                 // Claimed by a support agent
  WAITING_ON_USER = 'WAITING_ON_USER',   // Agent replied; awaiting guest/host action
  RESOLVED = 'RESOLVED',                 // Issue closed; user can reopen within 48h
  CLOSED = 'CLOSED',                     // Permanently locked archive
}

export enum TicketPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT', // Auto-assigned for active check-in / handover emergencies
}

export enum RequesterRole {
  GUEST = 'GUEST',
  HOST = 'HOST',
}

export enum MessageSenderRole {
  GUEST = 'GUEST',
  HOST = 'HOST',
  SUPPORT_AGENT = 'SUPPORT_AGENT',
  SYSTEM = 'SYSTEM',
}

export enum MessageVisibility {
  PUBLIC = 'PUBLIC',                 // Visible to Guest/Host and Support Agents
  INTERNAL_NOTE = 'INTERNAL_NOTE',   // Strictly visible ONLY to Support Agents / Admins
}

export enum BookingContextType {
  SHORTLET = 'SHORTLET',
  HOTEL = 'HOTEL',
  CAR_RENTAL = 'CAR_RENTAL',
  VIP_VENUE = 'VIP_VENUE',
  PAYOUT = 'PAYOUT',
  NONE = 'NONE',
}

export interface ChatAttachment {
  url: string;
  publicId: string;
  mimeType: string;
  fileName?: string;
  sizeBytes?: number;
}

export interface AuthenticatedActor {
  userId: string;
  role: 'GUEST' | 'HOST' | 'SUPPORT_AGENT' | 'ADMIN';
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
  contextType: BookingContextType;
  contextId: string | null;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number; // Automatically mapped to requesterUnreadCount or agentUnreadCount
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Internal agent fields are only attached when serialized for SUPPORT_AGENT / ADMIN
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
  attachments: ChatAttachment[];
  readAt: string | null;
  createdAt: string;
}

export interface CursorPaginationResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}