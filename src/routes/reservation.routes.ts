import { Router } from 'express';
import { 
  initiateBooking, 
  paystackWebhook, 
  getMyBookings, 
  confirmCheckIn, 
  cancelBooking, createWhatsappIntent, generateConciergeCheckout
} from '../controllers/reservation.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/webhook', paystackWebhook);

router.use(protect);

router.post('/whatsapp-intent', createWhatsappIntent);
router.post('/generate-checkout', protect, restrictTo('ADMIN'), generateConciergeCheckout);
router.post('/book', initiateBooking);
router.get('/my-bookings', getMyBookings);
router.patch('/:reservationId/confirm-checkin', confirmCheckIn);
router.post('/:reservationId/cancel', protect, cancelBooking);

export default router;