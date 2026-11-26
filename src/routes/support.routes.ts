import { Router } from 'express';
import { SupportController } from '../controllers/support.controller';
// Adjust these imports to match your existing auth & role middlewares
import { protect, restrictTo } from '../middlewares/auth.middleware';
import {
  createTicketRateLimiter,
  sendMessageRateLimiter,
} from '../middlewares/supportRateLimiter';

const router = Router();

// All support chat routes require a valid JWT (USER, LANDLORD, SUPPORT_AGENT, or ADMIN)
router.use(protect);

// Ticket lifecycle
router.post('/tickets', createTicketRateLimiter, SupportController.createTicket);
router.get('/tickets', SupportController.listTickets);
router.get('/tickets/:ticketId', SupportController.getTicketDetails);

// Messages & read receipts
router.get('/tickets/:ticketId/messages', SupportController.listMessages);
router.post(
  '/tickets/:ticketId/messages',
  sendMessageRateLimiter,
  SupportController.sendMessage
);
router.patch('/tickets/:ticketId/read', SupportController.markTicketRead);

// Status & Staff operations
router.patch('/tickets/:ticketId/status', SupportController.updateTicketStatus);
router.patch(
  '/tickets/:ticketId/assign',
  restrictTo('ADMIN', 'SUPPORT_AGENT'),
  SupportController.assignTicket
);
router.patch(
  '/tickets/:ticketId/tags',
  restrictTo('ADMIN', 'SUPPORT_AGENT'),
  SupportController.updateInternalTags
);

export default router;