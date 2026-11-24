import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { SupportService } from '../services/support.service';
import { AuthenticatedActor, UserRole } from '../types';
import { SupportApiError } from '../utils/support.errors';
import {
  assignTicketSchema,
  createTicketSchema,
  listMessagesQuerySchema,
  listTicketsQuerySchema,
  sendMessageSchema,
  ticketIdParamSchema,
  updateInternalTagsSchema,
  updateTicketStatusSchema,
} from '../validators/support.validator';

interface RequestUserPayload {
  id?: string;
  _id?: { toString(): string } | string;
  userId?: string;
  role?: UserRole;
  firstName?: string;
  lastName?: string;
  hostDisplayName?: string;
  fullName?: string;
}

const extractActor = (req: Request): AuthenticatedActor => {
  const user = (req as Request & { user?: RequestUserPayload }).user;
  const userId =
    user?.userId ||
    user?.id ||
    (typeof user?._id === 'string' ? user._id : user?._id?.toString());

  if (!user || !userId || !user.role) {
    throw new SupportApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }

  const computedName =
    user.fullName ||
    user.hostDisplayName ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    (user.role === 'ADMIN' ? 'Support Agent' : 'Rentals Africa User');

  return {
    userId,
    role: user.role,
    fullName: computedName,
  };
};

const handleControllerError = (err: unknown, res: Response, next: NextFunction): void => {
  if (err instanceof SupportApiError) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request payload.',
      details: err.issues.map((issue) => ({
        field: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  next(err);
};

export class SupportController {
  // POST /api/support/tickets
  public static async createTicket(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = extractActor(req);
      const payload = createTicketSchema.parse(req.body);
      const result = await SupportService.createTicket(actor, payload);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      handleControllerError(err, res, next);
    }
  }

  // GET /api/support/tickets
  public static async listTickets(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = extractActor(req);
      const query = listTicketsQuerySchema.parse(req.query);
      const result = await SupportService.listTickets(actor, query);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      handleControllerError(err, res, next);
    }
  }

  // GET /api/support/tickets/:ticketId
  public static async getTicketDetails(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = extractActor(req);
      const { ticketId } = ticketIdParamSchema.parse(req.params);
      const ticket = await SupportService.getTicketDetails(actor, ticketId);

      res.status(200).json({
        success: true,
        data: { ticket },
      });
    } catch (err) {
      handleControllerError(err, res, next);
    }
  }

  // GET /api/support/tickets/:ticketId/messages
  public static async listMessages(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = extractActor(req);
      const { ticketId } = ticketIdParamSchema.parse(req.params);
      const query = listMessagesQuerySchema.parse(req.query);
      const result = await SupportService.listMessages(actor, ticketId, query);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      handleControllerError(err, res, next);
    }
  }

  // POST /api/support/tickets/:ticketId/messages
  public static async sendMessage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = extractActor(req);
      const { ticketId } = ticketIdParamSchema.parse(req.params);
      const payload = sendMessageSchema.parse(req.body);
      const result = await SupportService.sendMessage(actor, ticketId, payload);

      res.status(result.isDuplicate ? 200 : 201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      handleControllerError(err, res, next);
    }
  }

  // PATCH /api/support/tickets/:ticketId/read
  public static async markTicketRead(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = extractActor(req);
      const { ticketId } = ticketIdParamSchema.parse(req.params);
      const ticket = await SupportService.markTicketRead(actor, ticketId);

      res.status(200).json({
        success: true,
        data: { ticket },
      });
    } catch (err) {
      handleControllerError(err, res, next);
    }
  }

  // PATCH /api/support/tickets/:ticketId/assign  (ADMIN only)
  public static async assignTicket(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = extractActor(req);
      const { ticketId } = ticketIdParamSchema.parse(req.params);
      const { agentId } = assignTicketSchema.parse(req.body);
      const result = await SupportService.assignTicket(actor, ticketId, agentId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      handleControllerError(err, res, next);
    }
  }

  // PATCH /api/support/tickets/:ticketId/status
  public static async updateTicketStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = extractActor(req);
      const { ticketId } = ticketIdParamSchema.parse(req.params);
      const { status } = updateTicketStatusSchema.parse(req.body);
      const result = await SupportService.updateTicketStatus(actor, ticketId, status);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      handleControllerError(err, res, next);
    }
  }

  // PATCH /api/support/tickets/:ticketId/tags  (ADMIN only)
  public static async updateInternalTags(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = extractActor(req);
      const { ticketId } = ticketIdParamSchema.parse(req.params);
      const { tags } = updateInternalTagsSchema.parse(req.body);
      const ticket = await SupportService.updateInternalTags(actor, ticketId, tags);

      res.status(200).json({
        success: true,
        data: { ticket },
      });
    } catch (err) {
      handleControllerError(err, res, next);
    }
  }
}