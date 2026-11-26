import crypto from 'crypto';
import mongoose, { Schema } from 'mongoose';
import {
  AuthenticatedActor,
  ISupportTicket,
  ISupportTicketDocument,
  ISupportTicketModel,
  SanitizedTicketDTO,
} from '../types';

const generateTicketCode = (): string => {
  const randomDigits = crypto.randomInt(100000, 999999);
  return `RA-SUP-${randomDigits}`;
};

const supportTicketSchema: Schema<ISupportTicket, ISupportTicketModel> = new Schema<
  ISupportTicket,
  ISupportTicketModel
>(
  {
    ticketCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: generateTicketCode,
    },
    requesterId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requesterRole: {
      type: String,
      enum: ['USER', 'LANDLORD'],
      required: true,
    },
    assignedAgentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    category: {
      type: String,
      enum: [
        'SHORTLET_CHECKIN',
        'CAUTION_FEE_REFUND',
        'HOST_PAYOUT',
        'CAR_RENTAL_HANDOVER',
        'HOTEL_RESERVATION',
        'VIP_VENUE_EVENT',
        'ACCOUNT_KYC',
        'DISPUTE_ESCALATION',
        'GENERAL_INQUIRY',
      ],
      required: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
      default: 'NORMAL',
    },
    status: {
      type: String,
      enum: ['OPEN', 'ASSIGNED', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'],
      default: 'OPEN',
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    contextType: {
      type: String,
      enum: ['RESERVATION', 'CAR_RESERVATION', 'PROPERTY', 'CAR', 'NONE'],
      default: 'NONE',
    },
    contextId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    lastMessagePreview: {
      type: String,
      default: '',
      maxlength: 140,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    requesterUnreadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    agentUnreadCount: {
      type: Number,
      default: 1,
      min: 0,
    },
    // Strictly stripped from USER / LANDLORD responses
    internalTags: {
      type: [String],
      default: [],
    },
    slaFirstResponseAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound indexes for high-speed Web & Mobile pagination + Admin Queue sorting
supportTicketSchema.index({ requesterId: 1, lastMessageAt: -1 });
supportTicketSchema.index({ status: 1, priority: -1, lastMessageAt: -1 });
supportTicketSchema.index({ assignedAgentId: 1, status: 1, lastMessageAt: -1 });
supportTicketSchema.index({ contextType: 1, contextId: 1 });

supportTicketSchema.statics.generateTicketCode = generateTicketCode;

supportTicketSchema.statics.toSafeDTO = function (
  ticket: ISupportTicketDocument,
  actor: AuthenticatedActor
): SanitizedTicketDTO {
  const isStaff = actor.role === 'ADMIN' || actor.role === 'SUPPORT_AGENT';

  const baseDTO: SanitizedTicketDTO = {
    id: ticket._id.toString(),
    ticketCode: ticket.ticketCode,
    requesterId: ticket.requesterId.toString(),
    requesterRole: ticket.requesterRole,
    assignedAgentId: ticket.assignedAgentId ? ticket.assignedAgentId.toString() : null,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    subject: ticket.subject,
    contextType: ticket.contextType,
    contextId: ticket.contextId ? ticket.contextId.toString() : null,
    lastMessagePreview: ticket.lastMessagePreview,
    lastMessageAt: ticket.lastMessageAt.toISOString(),
    unreadCount: isStaff ? ticket.agentUnreadCount : ticket.requesterUnreadCount,
    resolvedAt: ticket.resolvedAt ? ticket.resolvedAt.toISOString() : null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };

  if (isStaff) {
    baseDTO.internalTags = ticket.internalTags;
    baseDTO.slaFirstResponseAt = ticket.slaFirstResponseAt
      ? ticket.slaFirstResponseAt.toISOString()
      : null;
  }

  return baseDTO;
};

export const SupportTicket = mongoose.model<ISupportTicket, ISupportTicketModel>(
  'SupportTicket',
  supportTicketSchema
);