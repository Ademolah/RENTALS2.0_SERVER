import mongoose, { Types } from 'mongoose';
import xss from 'xss';
import { SupportMessage } from '../models/SupportMessage.model';
import { SupportTicket } from '../models/SupportTicket.model';
import {
  AuthenticatedActor,
  CursorPaginationResult,
  IChatAttachment,
  ISupportTicketDocument,
  MessageSenderRole,
  SanitizedMessageDTO,
  SanitizedTicketDTO,
  SupportContextType,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '../types';
import { SupportApiError } from '../utils/support.errors';
import {
  CreateTicketInput,
  ListMessagesQuery,
  ListTicketsQuery,
  SendMessageInput,
} from '../validators/support.validator';

const REOPEN_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

const sanitizeText = (raw: string): string =>
  xss(raw, {
    whiteList: {}, // Strip all HTML tags for plain-text chat safety
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
  }).trim();

/**
 * Strips `undefined` optional properties so attachment objects satisfy
 * `exactOptionalPropertyTypes: true` when passed into Mongoose `.create()`.
 */
const normalizeAttachments = (
  attachments: SendMessageInput['attachments']
): IChatAttachment[] =>
  attachments.map((att) => {
    const clean: IChatAttachment = {
      url: att.url,
      publicId: att.publicId,
      mimeType: att.mimeType,
    };
    if (att.fileName !== undefined) {
      clean.fileName = att.fileName;
    }
    if (att.sizeBytes !== undefined) {
      clean.sizeBytes = att.sizeBytes;
    }
    return clean;
  });

const buildPreview = (body: string, attachmentCount: number): string => {
  if (body) {
    return body.length > 135 ? `${body.slice(0, 132)}...` : body;
  }
  return attachmentCount === 1
    ? '[Attachment]'
    : `[${attachmentCount} Attachments]`;
};

const encodeCursor = (timestamp: Date, id: Types.ObjectId): string =>
  Buffer.from(`${timestamp.toISOString()}_${id.toString()}`, 'utf8').toString('base64url');

const decodeCursor = (cursor: string): { timestamp: Date; id: Types.ObjectId } => {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [iso, rawId] = decoded.split('_');
    if (!iso || !rawId) {
      throw new Error('Malformed cursor');
    }
    const timestamp = new Date(iso);
    if (Number.isNaN(timestamp.getTime()) || !Types.ObjectId.isValid(rawId)) {
      throw new Error('Malformed cursor');
    }
    return { timestamp, id: new Types.ObjectId(rawId) };
  } catch {
    throw new SupportApiError(400, 'INVALID_CURSOR', 'Pagination cursor is invalid.');
  }
};

export class SupportService {
  /**
   * Prevents IDOR: confirms that a USER or LANDLORD actually owns or booked
   * the referenced Reservation, CarReservation, Property, or Car before linking it.
   */
  private static async verifyContextOwnership(
    actor: AuthenticatedActor,
    contextType: SupportContextType,
    contextId: string | null
  ): Promise<Types.ObjectId | null> {
    if (contextType === 'NONE' || !contextId) {
      return null;
    }

    const objectId = new Types.ObjectId(contextId);

    // Admins can attach any valid context ID
    if (actor.role === 'ADMIN') {
      return objectId;
    }

    const actorObjectId = new Types.ObjectId(actor.userId);

    if (contextType === 'PROPERTY') {
      const PropertyModel = mongoose.model('Property');
      const exists = await PropertyModel.exists({
        _id: objectId,
        ownerId: actorObjectId,
      });
      if (!exists) {
        throw new SupportApiError(404, 'CONTEXT_NOT_FOUND', 'Referenced property was not found.');
      }
      return objectId;
    }

    if (contextType === 'CAR') {
      const CarModel = mongoose.model('Car');
      const exists = await CarModel.exists({
        _id: objectId,
        ownerId: actorObjectId,
      });
      if (!exists) {
        throw new SupportApiError(404, 'CONTEXT_NOT_FOUND', 'Referenced vehicle was not found.');
      }
      return objectId;
    }

    if (contextType === 'RESERVATION') {
      const ReservationModel = mongoose.model('Reservation');
      const reservation = await ReservationModel.findById(objectId)
        .select('userId propertyId')
        .lean<{ userId: Types.ObjectId; propertyId: Types.ObjectId } | null>();

      if (!reservation) {
        throw new SupportApiError(404, 'CONTEXT_NOT_FOUND', 'Referenced reservation was not found.');
      }

      if (reservation.userId.equals(actorObjectId)) {
        return objectId;
      }

      // Check if caller is the landlord who owns the booked property
      const PropertyModel = mongoose.model('Property');
      const isHost = await PropertyModel.exists({
        _id: reservation.propertyId,
        ownerId: actorObjectId,
      });

      if (!isHost) {
        throw new SupportApiError(404, 'CONTEXT_NOT_FOUND', 'Referenced reservation was not found.');
      }
      return objectId;
    }

    if (contextType === 'CAR_RESERVATION') {
      const CarReservationModel = mongoose.model('CarReservation');
      const carReservation = await CarReservationModel.findById(objectId)
        .select('userId carId')
        .lean<{ userId: Types.ObjectId; carId: Types.ObjectId } | null>();

      if (!carReservation) {
        throw new SupportApiError(
          404,
          'CONTEXT_NOT_FOUND',
          'Referenced car reservation was not found.'
        );
      }

      if (carReservation.userId.equals(actorObjectId)) {
        return objectId;
      }

      const CarModel = mongoose.model('Car');
      const isOwner = await CarModel.exists({
        _id: carReservation.carId,
        ownerId: actorObjectId,
      });

      if (!isOwner) {
        throw new SupportApiError(
          404,
          'CONTEXT_NOT_FOUND',
          'Referenced car reservation was not found.'
        );
      }
      return objectId;
    }

    return null;
  }

  /**
   * Auto-escalates live handover/check-in emergencies so support agents see them first.
   */
  private static resolveInitialPriority(
    category: TicketCategory,
    requested: TicketPriority
  ): TicketPriority {
    if (
      (category === 'SHORTLET_CHECKIN' || category === 'CAR_RENTAL_HANDOVER') &&
      (requested === 'LOW' || requested === 'NORMAL')
    ) {
      return 'HIGH';
    }
    return requested;
  }

  /**
   * Enforces strict ticket access control (IDOR guard).
   */
  public static async getAuthorizedTicketDocument(
    actor: AuthenticatedActor,
    ticketId: string
  ): Promise<ISupportTicketDocument> {
    if (!Types.ObjectId.isValid(ticketId)) {
      throw new SupportApiError(400, 'INVALID_TICKET_ID', 'Invalid support ticket ID.');
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      throw new SupportApiError(404, 'TICKET_NOT_FOUND', 'Support ticket not found.');
    }

    if (actor.role !== 'ADMIN' && ticket.requesterId.toString() !== actor.userId) {
      // Return 404 instead of 403 to prevent leaking ticket existence
      throw new SupportApiError(404, 'TICKET_NOT_FOUND', 'Support ticket not found.');
    }

    return ticket;
  }

  /**
   * Creates a new support ticket and its opening message atomically.
   */
  public static async createTicket(
    actor: AuthenticatedActor,
    input: CreateTicketInput
  ): Promise<{ ticket: SanitizedTicketDTO; initialMessage: SanitizedMessageDTO }> {
    if (actor.role === 'ADMIN') {
      throw new SupportApiError(
        403,
        'ADMIN_CANNOT_OPEN_TICKET',
        'Support agents cannot open customer tickets.'
      );
    }

    const verifiedContextId = await this.verifyContextOwnership(
      actor,
      input.contextType,
      input.contextId
    );

    const cleanSubject = sanitizeText(input.subject);
    const cleanBody = sanitizeText(input.initialMessage);
    const cleanAttachments = normalizeAttachments(input.attachments);
    const priority = this.resolveInitialPriority(input.category, input.priority);
    const preview = buildPreview(cleanBody, cleanAttachments.length);
    const now = new Date();

    const ticket = new SupportTicket({
      requesterId: new Types.ObjectId(actor.userId),
      requesterRole: actor.role,
      category: input.category,
      priority,
      status: 'OPEN',
      subject: cleanSubject,
      contextType: input.contextType,
      contextId: verifiedContextId,
      lastMessagePreview: preview,
      lastMessageAt: now,
      requesterUnreadCount: 0,
      agentUnreadCount: 1,
    });

    await ticket.save();

    try {
      const message = await SupportMessage.create({
        ticketId: ticket._id,
        clientMessageId: input.clientMessageId,
        senderId: new Types.ObjectId(actor.userId),
        senderRole: actor.role,
        senderDisplayName: actor.fullName,
        visibility: 'PUBLIC',
        body: cleanBody,
        attachments: cleanAttachments,
      });

      const safeMessage = SupportMessage.toSafeDTO(message, actor);
      if (!safeMessage) {
        throw new Error('Failed to serialize initial message');
      }

      return {
        ticket: SupportTicket.toSafeDTO(ticket, actor),
        initialMessage: safeMessage,
      };
    } catch (err) {
      // Roll back orphan ticket if initial message write fails
      await SupportTicket.deleteOne({ _id: ticket._id });
      throw err;
    }
  }

  /**
   * Lists tickets with strict tenant isolation and composite cursor pagination.
   */
  public static async listTickets(
    actor: AuthenticatedActor,
    query: ListTicketsQuery
  ): Promise<CursorPaginationResult<SanitizedTicketDTO>> {
    const filter: Record<string, unknown> = {};

    if (actor.role !== 'ADMIN') {
      // Hard isolation: Users and Landlords only ever see their own tickets
      filter.requesterId = new Types.ObjectId(actor.userId);
    } else {
      if (query.assignedToMe) {
        filter.assignedAgentId = new Types.ObjectId(actor.userId);
      } else if (query.unassignedOnly) {
        filter.assignedAgentId = null;
      }
      if (query.priority) {
        filter.priority = query.priority;
      }
      if (query.search) {
        const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { ticketCode: { $regex: escaped, $options: 'i' } },
          { subject: { $regex: escaped, $options: 'i' } },
        ];
      }
    }

    if (query.status) {
      filter.status = query.status;
    }
    if (query.category) {
      filter.category = query.category;
    }

    if (query.cursor) {
      const { timestamp, id } = decodeCursor(query.cursor);
      const cursorCondition = {
        $or: [
          { lastMessageAt: { $lt: timestamp } },
          { lastMessageAt: timestamp, _id: { $lt: id } },
        ],
      };
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, cursorCondition];
        delete filter.$or;
      } else {
        Object.assign(filter, cursorCondition);
      }
    }

    const docs = await SupportTicket.find(filter)
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(query.limit + 1);

    const hasMore = docs.length > query.limit;
    const slice = hasMore ? docs.slice(0, query.limit) : docs;
    const lastTicket = slice[slice.length - 1];

    const nextCursor =
      hasMore && lastTicket
        ? encodeCursor(lastTicket.lastMessageAt, lastTicket._id as Types.ObjectId)
        : null;

    return {
      items: slice.map((doc) => SupportTicket.toSafeDTO(doc, actor)),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Fetches a single authorized ticket.
   */
  public static async getTicketDetails(
    actor: AuthenticatedActor,
    ticketId: string
  ): Promise<SanitizedTicketDTO> {
    const ticket = await this.getAuthorizedTicketDocument(actor, ticketId);
    return SupportTicket.toSafeDTO(ticket, actor);
  }

  /**
   * Paginates chat messages newest-first (for reverse infinite scroll on Web & Mobile).
   * Enforces PUBLIC-only visibility for USER and LANDLORD roles.
   */
  public static async listMessages(
    actor: AuthenticatedActor,
    ticketId: string,
    query: ListMessagesQuery
  ): Promise<CursorPaginationResult<SanitizedMessageDTO>> {
    const ticket = await this.getAuthorizedTicketDocument(actor, ticketId);

    const filter: Record<string, unknown> = {
      ticketId: ticket._id,
    };

    // Database-level security guard against internal note leakage
    if (actor.role !== 'ADMIN') {
      filter.visibility = 'PUBLIC';
    }

    if (query.cursor) {
      if (!Types.ObjectId.isValid(query.cursor)) {
        throw new SupportApiError(400, 'INVALID_CURSOR', 'Message cursor is invalid.');
      }
      filter._id = { $lt: new Types.ObjectId(query.cursor) };
    }

    const docs = await SupportMessage.find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1);

    const hasMore = docs.length > query.limit;
    const slice = hasMore ? docs.slice(0, query.limit) : docs;
    const lastMessage = slice[slice.length - 1];

    const items = slice
      .map((doc) => SupportMessage.toSafeDTO(doc, actor))
      .filter((dto): dto is SanitizedMessageDTO => dto !== null);

    const nextCursor = hasMore && lastMessage ? lastMessage._id.toString() : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Sends an idempotent message (or internal note for ADMINs) and atomically updates ticket state.
   */
  public static async sendMessage(
    actor: AuthenticatedActor,
    ticketId: string,
    input: SendMessageInput
  ): Promise<{
    message: SanitizedMessageDTO;
    ticket: SanitizedTicketDTO;
    isDuplicate: boolean;
  }> {
    const ticket = await this.getAuthorizedTicketDocument(actor, ticketId);
    const isStaff = actor.role === 'ADMIN';

    // 1. Block non-admins from creating internal notes
    if (input.visibility === 'INTERNAL_NOTE' && !isStaff) {
      throw new SupportApiError(
        403,
        'FORBIDDEN_VISIBILITY',
        'You are not authorized to post internal notes.'
      );
    }

    // 2. Idempotency check (handles mobile network retries cleanly)
    const existing = await SupportMessage.findOne({
      ticketId: ticket._id,
      clientMessageId: input.clientMessageId,
    });

    if (existing) {
      const safeExisting = SupportMessage.toSafeDTO(existing, actor);
      if (!safeExisting) {
        throw new SupportApiError(403, 'FORBIDDEN', 'Access denied to message.');
      }
      return {
        message: safeExisting,
        ticket: SupportTicket.toSafeDTO(ticket, actor),
        isDuplicate: true,
      };
    }

    // 3. Enforce lifecycle lock rules
    if (ticket.status === 'CLOSED') {
      throw new SupportApiError(
        409,
        'TICKET_CLOSED',
        'This support conversation is closed. Please open a new support request.'
      );
    }

    if (ticket.status === 'RESOLVED' && !isStaff) {
      const resolvedTime = ticket.resolvedAt ? ticket.resolvedAt.getTime() : 0;
      if (Date.now() - resolvedTime > REOPEN_WINDOW_MS) {
        throw new SupportApiError(
          409,
          'REOPEN_WINDOW_EXPIRED',
          'This ticket was resolved more than 48 hours ago. Please start a new chat.'
        );
      }
    }

    const cleanBody = sanitizeText(input.body);
    const cleanAttachments = normalizeAttachments(input.attachments);
    const senderRole: MessageSenderRole = actor.role;
    const senderDisplayName = isStaff
      ? `${actor.fullName} (Rentals Africa Support)`
      : actor.fullName;

    const message = await SupportMessage.create({
      ticketId: ticket._id,
      clientMessageId: input.clientMessageId,
      senderId: new Types.ObjectId(actor.userId),
      senderRole,
      senderDisplayName,
      visibility: input.visibility,
      body: cleanBody,
      attachments: cleanAttachments,
    });

    // 4. Update ticket metadata ONLY for PUBLIC messages (prevents internal note preview leak)
    if (input.visibility === 'PUBLIC') {
      const now = new Date();
      const updateOps: Record<string, unknown> = {
        $set: {
          lastMessagePreview: buildPreview(cleanBody, cleanAttachments.length),
          lastMessageAt: now,
        },
        $inc: isStaff ? { requesterUnreadCount: 1 } : { agentUnreadCount: 1 },
      };

      const setFields = updateOps.$set as Record<string, unknown>;

      if (isStaff) {
        setFields.status = 'WAITING_ON_USER';
        if (!ticket.assignedAgentId) {
          setFields.assignedAgentId = new Types.ObjectId(actor.userId);
        }
        if (!ticket.slaFirstResponseAt) {
          setFields.slaFirstResponseAt = now;
        }
      } else {
        // User or Landlord replied
        if (ticket.status === 'RESOLVED' || ticket.status === 'WAITING_ON_USER') {
          setFields.status = ticket.assignedAgentId ? 'ASSIGNED' : 'OPEN';
          setFields.resolvedAt = null;
          setFields.resolvedBy = null;
        }
      }

      const updatedTicket = await SupportTicket.findByIdAndUpdate(ticket._id, updateOps, {
        new: true,
      });

      if (updatedTicket) {
        Object.assign(ticket, updatedTicket);
      }
    }

    const safeMessage = SupportMessage.toSafeDTO(message, actor);
    if (!safeMessage) {
      throw new Error('Failed to serialize created message');
    }

    return {
      message: safeMessage,
      ticket: SupportTicket.toSafeDTO(ticket, actor),
      isDuplicate: false,
    };
  }

  /**
   * Marks all incoming public messages on a ticket as read for the active party.
   */
  public static async markTicketRead(
    actor: AuthenticatedActor,
    ticketId: string
  ): Promise<SanitizedTicketDTO> {
    const ticket = await this.getAuthorizedTicketDocument(actor, ticketId);
    const isStaff = actor.role === 'ADMIN';
    const now = new Date();

    // Mark messages sent by the opposite party as read
    await SupportMessage.updateMany(
      {
        ticketId: ticket._id,
        visibility: 'PUBLIC',
        readAt: null,
        senderRole: isStaff ? { $in: ['USER', 'LANDLORD'] } : 'ADMIN',
      },
      { $set: { readAt: now } }
    );

    const updated = await SupportTicket.findByIdAndUpdate(
      ticket._id,
      {
        $set: isStaff ? { agentUnreadCount: 0 } : { requesterUnreadCount: 0 },
      },
      { new: true }
    );

    return SupportTicket.toSafeDTO(updated || ticket, actor);
  }

  /**
   * Admin-only: Claims or transfers a ticket and appends a transparent SYSTEM event.
   */
  public static async assignTicket(
    actor: AuthenticatedActor,
    ticketId: string,
    agentId: string | null
  ): Promise<{ ticket: SanitizedTicketDTO; systemMessage: SanitizedMessageDTO }> {
    if (actor.role !== 'ADMIN') {
      throw new SupportApiError(403, 'FORBIDDEN', 'Only support agents can assign tickets.');
    }

    const ticket = await this.getAuthorizedTicketDocument(actor, ticketId);

    if (ticket.status === 'CLOSED') {
      throw new SupportApiError(409, 'TICKET_CLOSED', 'Cannot assign a closed ticket.');
    }

    const nextAssignedId = agentId ? new Types.ObjectId(agentId) : null;
    const nextStatus: TicketStatus = nextAssignedId
      ? ticket.status === 'OPEN'
        ? 'ASSIGNED'
        : ticket.status
      : 'OPEN';

    const updatedTicket = await SupportTicket.findByIdAndUpdate(
      ticket._id,
      {
        $set: {
          assignedAgentId: nextAssignedId,
          status: nextStatus,
        },
      },
      { new: true }
    );

    const systemBody = nextAssignedId
      ? `${actor.fullName} from Rentals Africa Support joined the conversation.`
      : 'Ticket returned to the support queue.';

    const sysMsg = await SupportMessage.create({
      ticketId: ticket._id,
      clientMessageId: `sys-assign-${new Types.ObjectId().toString()}`,
      senderId: new Types.ObjectId(actor.userId),
      senderRole: 'SYSTEM',
      senderDisplayName: 'Rentals Africa',
      visibility: 'PUBLIC',
      body: systemBody,
      attachments: [],
    });

    const safeSysMsg = SupportMessage.toSafeDTO(sysMsg, actor);
    if (!safeSysMsg) {
      throw new Error('Failed to serialize system message');
    }

    return {
      ticket: SupportTicket.toSafeDTO(updatedTicket || ticket, actor),
      systemMessage: safeSysMsg,
    };
  }

  /**
   * Updates ticket status with role-appropriate transition guards.
   */
  public static async updateTicketStatus(
    actor: AuthenticatedActor,
    ticketId: string,
    nextStatus: TicketStatus
  ): Promise<{ ticket: SanitizedTicketDTO; systemMessage: SanitizedMessageDTO }> {
    const ticket = await this.getAuthorizedTicketDocument(actor, ticketId);
    const isStaff = actor.role === 'ADMIN';

    if (!isStaff) {
      // Users/Landlords can only mark their ticket RESOLVED or reopen a RESOLVED ticket within 48h
      if (nextStatus === 'RESOLVED') {
        if (ticket.status === 'CLOSED') {
          throw new SupportApiError(409, 'TICKET_CLOSED', 'Ticket is already closed.');
        }
      } else if (nextStatus === 'OPEN') {
        if (ticket.status !== 'RESOLVED') {
          throw new SupportApiError(
            400,
            'INVALID_TRANSITION',
            'Only resolved tickets can be reopened.'
          );
        }
        const resolvedTime = ticket.resolvedAt ? ticket.resolvedAt.getTime() : 0;
        if (Date.now() - resolvedTime > REOPEN_WINDOW_MS) {
          throw new SupportApiError(
            409,
            'REOPEN_WINDOW_EXPIRED',
            'Reopen window has expired. Please create a new ticket.'
          );
        }
      } else {
        throw new SupportApiError(
          403,
          'FORBIDDEN_TRANSITION',
          'You are not authorized to set this ticket status.'
        );
      }
    }

    const now = new Date();
    const resolvedStatus: TicketStatus =
      !isStaff && nextStatus === 'OPEN'
        ? ticket.assignedAgentId
          ? 'ASSIGNED'
          : 'OPEN'
        : nextStatus;

    const updateSet: Record<string, unknown> = { status: resolvedStatus };
    if (resolvedStatus === 'RESOLVED' || resolvedStatus === 'CLOSED') {
      updateSet.resolvedAt = now;
      updateSet.resolvedBy = new Types.ObjectId(actor.userId);
    } else {
      updateSet.resolvedAt = null;
      updateSet.resolvedBy = null;
    }

    const updatedTicket = await SupportTicket.findByIdAndUpdate(
      ticket._id,
      { $set: updateSet },
      { new: true }
    );

    const statusLabelMap: Record<TicketStatus, string> = {
      OPEN: 'Conversation reopened.',
      ASSIGNED: 'Conversation reopened and routed to your agent.',
      WAITING_ON_USER: 'Agent is awaiting your response.',
      RESOLVED: `Conversation marked as resolved by ${isStaff ? 'Rentals Africa Support' : actor.fullName}.`,
      CLOSED: 'Conversation has been closed and archived.',
    };

    const sysMsg = await SupportMessage.create({
      ticketId: ticket._id,
      clientMessageId: `sys-status-${new Types.ObjectId().toString()}`,
      senderId: new Types.ObjectId(actor.userId),
      senderRole: 'SYSTEM',
      senderDisplayName: 'Rentals Africa',
      visibility: 'PUBLIC',
      body: statusLabelMap[resolvedStatus],
      attachments: [],
    });

    const safeSysMsg = SupportMessage.toSafeDTO(sysMsg, actor);
    if (!safeSysMsg) {
      throw new Error('Failed to serialize status system message');
    }

    return {
      ticket: SupportTicket.toSafeDTO(updatedTicket || ticket, actor),
      systemMessage: safeSysMsg,
    };
  }

  /**
   * Admin-only: Updates internal classification tags (strictly invisible to Users/Landlords).
   */
  public static async updateInternalTags(
    actor: AuthenticatedActor,
    ticketId: string,
    tags: string[]
  ): Promise<SanitizedTicketDTO> {
    if (actor.role !== 'ADMIN') {
      throw new SupportApiError(403, 'FORBIDDEN', 'Only support agents can edit internal tags.');
    }

    const ticket = await this.getAuthorizedTicketDocument(actor, ticketId);
    const uniqueTags = Array.from(new Set(tags));

    const updated = await SupportTicket.findByIdAndUpdate(
      ticket._id,
      { $set: { internalTags: uniqueTags } },
      { new: true }
    );

    return SupportTicket.toSafeDTO(updated || ticket, actor);
  }
}