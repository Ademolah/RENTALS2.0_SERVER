import { Router } from 'express';
import { 
  createHotel, 
  updateHotel, 
  deleteHotel, 
  checkHotelRoomAvailability,
  getHotels,     
  getHotel , getLandlordHotelBookings, confirmHotelCheckIn, getLandlordHotels, getGuestHotelBookings, guestConfirmHotelCheckIn
} from '../controllers/property.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';

const router = Router();

router.get('/landlord/bookings',protect, restrictTo('LANDLORD', 'ADMIN'), getLandlordHotelBookings);
router.post('/bookings/:id/confirm-checkin',protect, restrictTo('LANDLORD', 'ADMIN'), confirmHotelCheckIn);

// Add this line in your protected landlord routes section
router.get('/landlord/portfolio', protect, restrictTo('LANDLORD', 'ADMIN'), getLandlordHotels);

// ==========================================
// PUBLIC ROUTES (No login required to view)
// ==========================================
router.get('/', getHotels);
router.get('/:id', getHotel);

// ==========================================
// PROTECTED ROUTES (Landlords & Admins only)
// ==========================================
router.get('/guest/bookings', protect,  getGuestHotelBookings);
router.post('/', protect, restrictTo('LANDLORD', 'ADMIN'), upload.array('images', 15), createHotel);
router.patch('/:id', protect, restrictTo('LANDLORD', 'ADMIN'), upload.array('images', 15), updateHotel);
router.delete('/:id', protect, restrictTo('LANDLORD', 'ADMIN'), deleteHotel);


router.patch('/guest/bookings/:id/confirm', protect, guestConfirmHotelCheckIn);

// Availability check for a specific room type
router.get('/:hotelId/rooms/:roomTypeId/availability', checkHotelRoomAvailability);

export default router;