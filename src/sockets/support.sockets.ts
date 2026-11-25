import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Namespace, Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { z } from 'zod';
import { createRedisDuplicate, redisClient } from '../config/redis';
import { SupportMessage } from '../models/SupportMessage.model';
import { SupportService } from '../services/support.service';
import {
  AuthenticatedActor,
  SanitizedMessageDTO,
  SanitizedTicketDTO,
  UserRole,
} from '../types';
import { SupportApiError } from '../utils/support.errors';
import { sendMessageSchema } from '../validators/support.validator';

// ============================================================================
// Socket Validation Schemas & Types
// ============================================================================

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

const ticketRoomPayloadSchema = z.object({
  ticketId: objectIdSchema,
});

const typingPayloadSchema = z.object({
  ticketId: objectIdSchema,
  isTyping: z.boolean(),
});

const socketSendMessageSchema = sendMessageSchema.extend({
  ticketId: objectIdSchema,
});

const syncMessagesPayloadSchema = z.object({
  ticketId: objectIdSchema,
  afterMessageId: objectIdSchema.optional(),
});

interface JwtDecodedPayload {
  id?: string;
  _id?: string;
  userId?: string;
  sub?: string;
  role?: UserRole;
  firstName?: string;
  lastName?: string;
  hostDisplayName?: string;
  fullName?: string;
}

interface LeanUserRecord {
  _id: mongoose.Types.ObjectId;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  hostDisplayName?: string;
}

type AckResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; code: string; message: string; details?: unknown };

type AckCallback<T = unknown> = (response: AckResponse<T>) => void;

// ============================================================================
// Room Naming Helpers (Single Source of Truth)
// ============================================================================

const ROOMS = {
  userPersonal: (userId: string): string => `user:${userId}`,
  staffAgents: 'staff:agents',
  ticketPublic: (ticketId: string): string => `ticket:${ticketId}:public`,
  ticketStaff: (ticketId: string): string => `ticket:${ticketId}:staff`,
};

const PRESENCE_KEYS = {
  userSockets: (userId: string): string => `support:presence:user:${userId}`,
  onlineAgents: 'support:presence:agents',
  socketRateLimit: (userId: string): string => `rl:support:ws:msg:${userId}`,
};

const PRESENCE_TTL_SECONDS = 60 * 60 * 6; // 6-hour safety TTL against orphan keys

// ============================================================================
// Realtime Event Bridge (Usable by both Socket Handlers & REST Controllers)
// ============================================================================

let supportNamespace: Namespace | null = null;

export class SupportRealtimeBridge {
  public static getNamespace(): Namespace | null {
    return supportNamespace;
  }

  /**
   * Broadcasts a newly created ticket to the requester's personal devices
   * and to all connected support agents in the live queue.
   */
  public static emitTicketCreated(
    ticket: SanitizedTicketDTO,
    initialMessage: SanitizedMessageDTO
  ): void {
    if (!supportNamespace) return;

    // Notify requester's other open tabs/devices
    supportNamespace
      .to(ROOMS.userPersonal(ticket.requesterId))
      .emit('support:ticket:created', { ticket, initialMessage });

    // Notify live support agent queue
    supportNamespace
      .to(ROOMS.staffAgents)
      .emit('support:queue:new_ticket', { ticket, initialMessage });
  }

  /**
   * Routes a new message strictly according to its visibility:
   * - INTERNAL_NOTE -> ONLY `ticket:{id}:staff` (never leaks to USER / LANDLORD)
   * - PUBLIC / SYSTEM -> `ticket:{id}:public`, requester personal room, and staff queue
   */
  public static emitNewMessage(
    ticket: SanitizedTicketDTO,
    message: SanitizedMessageDTO,
    excludeSocketId?: string
  ): void {
    if (!supportNamespace) return;

    if (message.visibility === 'INTERNAL_NOTE') {
      const target = excludeSocketId
        ? supportNamespace.to(ROOMS.ticketStaff(ticket.id)).except(excludeSocketId)
        : supportNamespace.to(ROOMS.ticketStaff(ticket.id));

      target.emit('support:internal_note:new', {
        ticketId: ticket.id,
        message,
      });
      return;
    }

    // Public or System message
    const roomTarget = excludeSocketId
      ? supportNamespace.to(ROOMS.ticketPublic(ticket.id)).except(excludeSocketId)
      : supportNamespace.to(ROOMS.ticketPublic(ticket.id));

    roomTarget.emit('support:message:new', {
      ticketId: ticket.id,
      message,
    });

    // Push ticket preview & unread counter updates to requester's inbox list
    supportNamespace
      .to(ROOMS.userPersonal(ticket.requesterId))
      .emit('support:ticket:updated', { ticket });

    // Push queue update to support agents
    supportNamespace
      .to(ROOMS.staffAgents)
      .emit('support:queue:ticket_updated', { ticket });
  }

  /**
   * Broadcasts read receipts to participants inside the ticket room.
   */
  public static emitTicketRead(
    ticket: SanitizedTicketDTO,
    readByRole: UserRole
  ): void {
    if (!supportNamespace) return;

    supportNamespace.to(ROOMS.ticketPublic(ticket.id)).emit('support:read', {
      ticketId: ticket.id,
      readByRole,
      readAt: new Date().toISOString(),
    });

    if (readByRole === 'ADMIN') {
      supportNamespace
        .to(ROOMS.staffAgents)
        .emit('support:queue:ticket_updated', { ticket });
    } else {
      supportNamespace
        .to(ROOMS.userPersonal(ticket.requesterId))
        .emit('support:ticket:updated', { ticket });
    }
  }

  /**
   * Broadcasts ticket status or assignment updates.
   */
  public static emitTicketStateChanged(
    ticket: SanitizedTicketDTO,
    systemMessage?: SanitizedMessageDTO
  ): void {
    if (!supportNamespace) return;

    if (systemMessage) {
      supportNamespace.to(ROOMS.ticketPublic(ticket.id)).emit('support:message:new', {
        ticketId: ticket.id,
        message: systemMessage,
      });
    }

    supportNamespace
      .to(ROOMS.ticketPublic(ticket.id))
      .emit('support:ticket:state_changed', { ticket });

    supportNamespace
      .to(ROOMS.userPersonal(ticket.requesterId))
      .emit('support:ticket:updated', { ticket });

    supportNamespace
      .to(ROOMS.staffAgents)
      .emit('support:queue:ticket_updated', { ticket });
  }
}

// ============================================================================
// Authentication, Presence & Rate-Limit Helpers
// ============================================================================

const extractHandshakeToken = (socket: Socket): string | null => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.replace(/^Bearer\s+/i, '').trim();
  }

  const headerAuth = socket.handshake.headers?.authorization;
  if (typeof headerAuth === 'string' && headerAuth.trim()) {
    return headerAuth.replace(/^Bearer\s+/i, '').trim();
  }

  // Fallback for Postman / mobile clients passing ?token=...
  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.replace(/^Bearer\s+/i, '').trim();
  }

  return null;
};

const authenticateSocketActor = async (socket: Socket): Promise<AuthenticatedActor> => {
  const token = extractHandshakeToken(socket);
  if (!token) {
    throw new SupportApiError(401, 'UNAUTHORIZED', 'Authentication token is required.');
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('[SupportSocket] Missing JWT_SECRET environment variable.');
  }

  let decoded: JwtDecodedPayload;
  try {
    decoded = jwt.verify(token, jwtSecret) as unknown as JwtDecodedPayload;
  } catch {
    throw new SupportApiError(401, 'INVALID_TOKEN', 'Invalid or expired authentication token.');
  }

  const userId = decoded.userId || decoded.id || decoded._id || decoded.sub;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new SupportApiError(401, 'INVALID_TOKEN_PAYLOAD', 'Malformed token subject.');
  }

 // Hydrate fresh user role & display name from MongoDB so revoked/updated roles take immediate effect
  const UserModel = (mongoose.models.User ||
    mongoose.models.user ||
    mongoose.model('User')) as mongoose.Model<LeanUserRecord>;

  const userDoc = await UserModel.findById(userId)
    .select('role firstName lastName hostDisplayName')
    .lean<LeanUserRecord | null>();

  if (!userDoc) {
    throw new SupportApiError(401, 'USER_NOT_FOUND', 'Authenticated user no longer exists.');
  }

  const fullName =
    userDoc.hostDisplayName ||
    [userDoc.firstName, userDoc.lastName].filter(Boolean).join(' ').trim() ||
    (userDoc.role === 'ADMIN' ? 'Support Agent' : 'Rentals Africa User');

  return {
    userId: userDoc._id.toString(),
    role: userDoc.role,
    fullName,
  };
};

const registerPresence = async (actor: AuthenticatedActor, socketId: string): Promise<void> => {
  if (!redisClient || redisClient.status !== 'ready') return;

  try {
    const userKey = PRESENCE_KEYS.userSockets(actor.userId);
    const pipeline = redisClient.pipeline();
    pipeline.sadd(userKey, socketId);
    pipeline.expire(userKey, PRESENCE_TTL_SECONDS);
    if (actor.role === 'ADMIN') {
      pipeline.sadd(PRESENCE_KEYS.onlineAgents, actor.userId);
      pipeline.expire(PRESENCE_KEYS.onlineAgents, PRESENCE_TTL_SECONDS);
    }
    await pipeline.exec();
  } catch (err) {
    console.warn('[SupportSocket] Presence register warning:', (err as Error).message);
  }
};

const unregisterPresence = async (actor: AuthenticatedActor, socketId: string): Promise<void> => {
  if (!redisClient || redisClient.status !== 'ready') return;

  try {
    const userKey = PRESENCE_KEYS.userSockets(actor.userId);
    await redisClient.srem(userKey, socketId);
    const remainingSockets = await redisClient.scard(userKey);

    if (remainingSockets === 0) {
      await redisClient.del(userKey);
      if (actor.role === 'ADMIN') {
        await redisClient.srem(PRESENCE_KEYS.onlineAgents, actor.userId);
      }
    }
  } catch (err) {
    console.warn('[SupportSocket] Presence cleanup warning:', (err as Error).message);
  }
};

const checkSocketMessageRateLimit = async (userId: string): Promise<boolean> => {
  if (!redisClient || redisClient.status !== 'ready') return true; // Fail open if Redis is reconnecting

  try {
    const key = PRESENCE_KEYS.socketRateLimit(userId);
    const count = await redisClient.incr(key);
    if (count === 1) {
      await redisClient.expire(key, 60);
    }
    return count <= 45; // Matches HTTP limit: 45 messages/minute
  } catch {
    return true;
  }
};

const formatSocketError = (err: unknown): { code: string; message: string; details?: unknown } => {
  if (err instanceof SupportApiError) {
    return {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    };
  }
  if (err instanceof z.ZodError) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Invalid socket event payload.',
      details: err.issues.map((issue) => ({
        field: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected server error occurred.',
  };
};

// ============================================================================
// Socket.io Server Initializer
// ============================================================================

export const initializeSupportSocket = (httpServer: HttpServer): Server => {
  const allowedOrigins = process.env.CLIENT_ORIGINS
    ? process.env.CLIENT_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : true; // Reflects requesting origin when CLIENT_ORIGINS is unset (compatible with credentials: true)

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 20_000,
    pingInterval: 25_000,
    maxHttpBufferSize: 1e6, // 1MB payload ceiling (attachments upload to Cloudinary first)
    transports: ['polling', 'websocket'],
  });

  // Attach Redis Pub/Sub adapter only when Redis is actively connected
  if (redisClient && (redisClient.status === 'ready' || redisClient.status === 'connect')) {
    try {
      const pubClient = createRedisDuplicate('socket-pub');
      const subClient = createRedisDuplicate('socket-sub');
      pubClient.on('error', (err: Error) =>
        console.warn('[SupportSocket] Redis pub warning:', err.message)
      );
      subClient.on('error', (err: Error) =>
        console.warn('[SupportSocket] Redis sub warning:', err.message)
      );
      io.adapter(createAdapter(pubClient, subClient));
      console.info('[SupportSocket] Redis Pub/Sub adapter attached');
    } catch (err) {
      console.warn(
        '[SupportSocket] Running single-node memory adapter (Redis adapter init skipped):',
        (err as Error).message
      );
    }
  } else {
    console.info('[SupportSocket] Running single-node memory adapter (Redis not ready)');
  }

  const nsp = io.of('/support');
  supportNamespace = nsp;

  // 1. Handshake JWT Authentication Middleware
  nsp.use(async (socket, next) => {
    try {
      const actor = await authenticateSocketActor(socket);
      socket.data.actor = actor;
      next();
    } catch (err) {
      const formatted = formatSocketError(err);
      console.warn(`[SupportSocket] Handshake rejected (${formatted.code}): ${formatted.message}`);
      const authError = new Error(formatted.message) as Error & { data?: unknown };
      authError.data = formatted;
      next(authError);
    }
  });

  // 2. Connection Lifecycle & Event Handlers
  nsp.on('connection', async (socket: Socket) => {
    const actor = socket.data.actor as AuthenticatedActor;

    // Join personal or staff broadcast rooms
    await socket.join(ROOMS.userPersonal(actor.userId));
    if (actor.role === 'ADMIN') {
      await socket.join(ROOMS.staffAgents);
    }

    await registerPresence(actor, socket.id);

    // Confirm handshake & return online agent availability
    let onlineAgentsCount = 0;
    if (redisClient && redisClient.status === 'ready') {
      onlineAgentsCount = await redisClient.scard(PRESENCE_KEYS.onlineAgents).catch(() => 0);
    }

    socket.emit('support:connected', {
      userId: actor.userId,
      role: actor.role,
      agentsOnline: onlineAgentsCount > 0,
      onlineAgentsCount,
    });

    // ------------------------------------------------------------------------
    // Event: Join an Authorized Ticket Room
    // ------------------------------------------------------------------------
    socket.on('support:join_ticket', async (rawPayload: unknown, ack?: AckCallback) => {
      try {
        const { ticketId } = ticketRoomPayloadSchema.parse(rawPayload);
        const ticket = await SupportService.getAuthorizedTicketDocument(actor, ticketId);

        await socket.join(ROOMS.ticketPublic(ticketId));

        // ONLY admins join the internal staff room for this ticket
        if (actor.role === 'ADMIN') {
          await socket.join(ROOMS.ticketStaff(ticketId));
        }

        // Check if counterparty is currently online
        let counterpartyOnline = false;
        if (redisClient && redisClient.status === 'ready') {
          if (actor.role === 'ADMIN') {
            const count = await redisClient
              .scard(PRESENCE_KEYS.userSockets(ticket.requesterId.toString()))
              .catch(() => 0);
            counterpartyOnline = count > 0;
          } else {
            const agentCount = await redisClient
              .scard(PRESENCE_KEYS.onlineAgents)
              .catch(() => 0);
            counterpartyOnline = agentCount > 0;
          }
        }

        socket.to(ROOMS.ticketPublic(ticketId)).emit('support:presence:update', {
          ticketId,
          role: actor.role,
          isOnline: true,
        });

        ack?.({
          success: true,
          data: {
            ticket: SupportTicketToSafeSnapshot(ticket, actor),
            counterpartyOnline,
          },
        });
      } catch (err) {
        const formatted = formatSocketError(err);
        ack?.({ success: false, ...formatted });
      }
    });

    // ------------------------------------------------------------------------
    // Event: Leave a Ticket Room
    // ------------------------------------------------------------------------
    socket.on('support:leave_ticket', async (rawPayload: unknown, ack?: AckCallback) => {
      try {
        const { ticketId } = ticketRoomPayloadSchema.parse(rawPayload);
        await socket.leave(ROOMS.ticketPublic(ticketId));
        if (actor.role === 'ADMIN') {
          await socket.leave(ROOMS.ticketStaff(ticketId));
        }
        ack?.({ success: true, data: { ticketId } });
      } catch (err) {
        const formatted = formatSocketError(err);
        ack?.({ success: false, ...formatted });
      }
    });

    // ------------------------------------------------------------------------
    // Event: Send Live Message (or Internal Note for ADMINs)
    // ------------------------------------------------------------------------
    socket.on('support:message:send', async (rawPayload: unknown, ack?: AckCallback) => {
      try {
        const allowed = await checkSocketMessageRateLimit(actor.userId);
        if (!allowed) {
          throw new SupportApiError(
            429,
            'RATE_LIMIT_EXCEEDED',
            'You are sending messages too quickly. Please slow down.'
          );
        }

        const parsed = socketSendMessageSchema.parse(rawPayload);
        const result = await SupportService.sendMessage(actor, parsed.ticketId, parsed);

        if (!result.isDuplicate) {
          SupportRealtimeBridge.emitNewMessage(result.ticket, result.message, socket.id);
        }

        ack?.({
          success: true,
          data: result,
        });
      } catch (err) {
        const formatted = formatSocketError(err);
        ack?.({ success: false, ...formatted });
      }
    });

    // ------------------------------------------------------------------------
    // Event: Typing Indicator (Ephemeral, Never Persisted)
    // ------------------------------------------------------------------------
    socket.on('support:typing', async (rawPayload: unknown) => {
      try {
        const { ticketId, isTyping } = typingPayloadSchema.parse(rawPayload);
        const publicRoom = ROOMS.ticketPublic(ticketId);

        // Only relay typing indicator if this socket has already joined the authorized room
        if (!socket.rooms.has(publicRoom)) {
          return;
        }

        socket.to(publicRoom).emit('support:typing', {
          ticketId,
          senderRole: actor.role,
          senderDisplayName:
            actor.role === 'ADMIN' ? 'Rentals Africa Support' : actor.fullName,
          isTyping,
        });
      } catch {
        // Silently ignore malformed ephemeral typing events
      }
    });

    // ------------------------------------------------------------------------
    // Event: Mark Messages Read
    // ------------------------------------------------------------------------
    socket.on('support:mark_read', async (rawPayload: unknown, ack?: AckCallback) => {
      try {
        const { ticketId } = ticketRoomPayloadSchema.parse(rawPayload);
        const updatedTicket = await SupportService.markTicketRead(actor, ticketId);

        SupportRealtimeBridge.emitTicketRead(updatedTicket, actor.role);

        ack?.({
          success: true,
          data: { ticket: updatedTicket },
        });
      } catch (err) {
        const formatted = formatSocketError(err);
        ack?.({ success: false, ...formatted });
      }
    });

    // ------------------------------------------------------------------------
    // Event: Mobile Reconnect Catch-Up Sync
    // ------------------------------------------------------------------------
    socket.on('support:sync', async (rawPayload: unknown, ack?: AckCallback) => {
      try {
        const { ticketId, afterMessageId } = syncMessagesPayloadSchema.parse(rawPayload);
        const ticket = await SupportService.getAuthorizedTicketDocument(actor, ticketId);

        const filter: Record<string, unknown> = {
          ticketId: ticket._id,
        };

        if (actor.role !== 'ADMIN') {
          filter.visibility = 'PUBLIC';
        }

        if (afterMessageId) {
          filter._id = { $gt: new mongoose.Types.ObjectId(afterMessageId) };
        }

        const missedDocs = await SupportMessage.find(filter)
          .sort({ _id: 1 })
          .limit(100);

        const missedMessages = missedDocs
          .map((doc) => SupportMessage.toSafeDTO(doc, actor))
          .filter((dto): dto is SanitizedMessageDTO => dto !== null);

        ack?.({
          success: true,
          data: {
            ticket: SupportTicketToSafeSnapshot(ticket, actor),
            messages: missedMessages,
          },
        });
      } catch (err) {
        const formatted = formatSocketError(err);
        ack?.({ success: false, ...formatted });
      }
    });

    // ------------------------------------------------------------------------
    // Disconnect Cleanup
    // ------------------------------------------------------------------------
    socket.on('disconnect', async () => {
      await unregisterPresence(actor, socket.id);
    });
  });

  return io;
};

// Helper to serialize ticket cleanly without circular model import issues
import { SupportTicket } from '../models/SupportTicket.model';
import { ISupportTicketDocument } from '../types';

const SupportTicketToSafeSnapshot = (
  ticket: ISupportTicketDocument,
  actor: AuthenticatedActor
): SanitizedTicketDTO => SupportTicket.toSafeDTO(ticket, actor);