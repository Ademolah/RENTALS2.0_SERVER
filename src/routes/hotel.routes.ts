import { Router } from 'express';
import { 
  createHotel, 
  updateHotel, 
  deleteHotel, 
  checkHotelRoomAvailability,
  getHotels,     // <-- 1. Import this
  getHotel       // <-- 2. Import this
} from '../controllers/property.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';

const router = Router();

// ==========================================
// PUBLIC ROUTES (No login required to view)
// ==========================================
router.get('/', getHotels);
router.get('/:id', getHotel);

// ==========================================
// PROTECTED ROUTES (Landlords & Admins only)
// ==========================================
router.post('/', protect, restrictTo('LANDLORD', 'ADMIN'), upload.array('images', 15), createHotel);
router.patch('/:id', protect, restrictTo('LANDLORD', 'ADMIN'), upload.array('images', 15), updateHotel);
router.delete('/:id', protect, restrictTo('LANDLORD', 'ADMIN'), deleteHotel);

// Availability check for a specific room type
router.get('/:hotelId/rooms/:roomTypeId/availability', checkHotelRoomAvailability);

export default router;