import { Router } from 'express';
import { 
  initiateBooking, 
  paystackWebhook, 
  getMyBookings, 
  getLandlordBookings, 
  confirmCheckIn 
} from '../controllers/reservation.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/webhook', paystackWebhook);

router.use(protect);

router.post('/book', initiateBooking);
router.get('/my-bookings', getMyBookings);
router.get('/landlord-bookings', restrictTo('LANDLORD', 'ADMIN'), getLandlordBookings);
router.patch('/:reservationId/confirm-checkin', confirmCheckIn);

export default router;