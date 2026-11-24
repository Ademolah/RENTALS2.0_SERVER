import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const objectIdSchema = z.string().regex(objectIdRegex, 'Invalid resource identifier format');

export const attachmentSchema = z.object({
  url: z
    .string()
    .url('Invalid attachment URL')
    .refine((val) => val.startsWith('https://'), 'Attachments must use HTTPS'),
  publicId: z.string().min(1).max(255),
  mimeType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ]),
  fileName: z.string().max(140).optional(),
  sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024).optional(), // Max 10MB
});

export const createTicketSchema = z
  .object({
    category: z.enum([
      'SHORTLET_CHECKIN',
      'CAUTION_FEE_REFUND',
      'HOST_PAYOUT',
      'CAR_RENTAL_HANDOVER',
      'HOTEL_RESERVATION',
      'VIP_VENUE_EVENT',
      'ACCOUNT_KYC',
      'DISPUTE_ESCALATION',
      'GENERAL_INQUIRY',
    ]),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional().default('NORMAL'),
    subject: z.string().trim().min(4, 'Subject must be at least 4 characters').max(160),
    initialMessage: z
      .string()
      .trim()
      .min(1, 'Initial message cannot be empty')
      .max(4000, 'Message cannot exceed 4000 characters'),
    clientMessageId: z.string().trim().min(8).max(64),
    contextType: z
      .enum(['RESERVATION', 'CAR_RESERVATION', 'PROPERTY', 'CAR', 'NONE'])
      .optional()
      .default('NONE'),
    contextId: objectIdSchema.nullable().optional().default(null),
    attachments: z.array(attachmentSchema).max(5).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.contextType !== 'NONE' && !data.contextId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contextId'],
        message: 'contextId is required when contextType is specified',
      });
    }
    if (data.contextType === 'NONE' && data.contextId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contextType'],
        message: 'contextType must be specified when contextId is provided',
      });
    }
  });

export const sendMessageSchema = z
  .object({
    clientMessageId: z.string().trim().min(8).max(64),
    body: z.string().trim().max(4000).optional().default(''),
    attachments: z.array(attachmentSchema).max(5).optional().default([]),
    visibility: z.enum(['PUBLIC', 'INTERNAL_NOTE']).optional().default('PUBLIC'),
  })
  .superRefine((data, ctx) => {
    if (!data.body && data.attachments.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: 'Message must contain either text or at least one attachment',
      });
    }
  });

export const listTicketsQuerySchema = z.object({
  cursor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  status: z
    .enum(['OPEN', 'ASSIGNED', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'])
    .optional(),
  category: z
    .enum([
      'SHORTLET_CHECKIN',
      'CAUTION_FEE_REFUND',
      'HOST_PAYOUT',
      'CAR_RENTAL_HANDOVER',
      'HOTEL_RESERVATION',
      'VIP_VENUE_EVENT',
      'ACCOUNT_KYC',
      'DISPUTE_ESCALATION',
      'GENERAL_INQUIRY',
    ])
    .optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assignedToMe: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  unassignedOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().trim().max(60).optional(),
});

export const listMessagesQuerySchema = z.object({
  cursor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

export const assignTicketSchema = z.object({
  agentId: objectIdSchema.nullable(), // null unassigns back to queue
});

export const updateTicketStatusSchema = z.object({
  status: z.enum(['OPEN', 'ASSIGNED', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED']),
});

export const updateInternalTagsSchema = z.object({
  tags: z
    .array(z.string().trim().min(1).max(32).regex(/^[a-zA-Z0-9_-]+$/))
    .max(15),
});

export const ticketIdParamSchema = z.object({
  ticketId: objectIdSchema,
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;