import { Router } from 'express';
import { 
  initiateBooking, 
  paystackWebhook, 
  getMyBookings, 
  confirmCheckIn 
} from '../controllers/reservation.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/webhook', paystackWebhook);

router.use(protect);


router.post('/book', initiateBooking);
router.get('/my-bookings', getMyBookings);
router.patch('/:reservationId/confirm-checkin', confirmCheckIn);

export default router;