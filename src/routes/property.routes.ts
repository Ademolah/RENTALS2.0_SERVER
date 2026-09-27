import { Router } from 'express';
import { 
  createProperty, 
  getProperties, 
  getProperty,  
  updateProperty,
  checkPropertyAvailability,
  getLandlordBookings, checkHotelRoomAvailability
} from '../controllers/property.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';

const router = Router();

// Add the upload middleware before the controller. Max 10 images.
router.post(
  '/', 
  protect,
  restrictTo('ADMIN', 'LANDLORD'), 
  upload.array('images', 10), 
  createProperty
);

router.get('/:hotelId/rooms/:roomTypeId/availability', checkHotelRoomAvailability);

router.get('/', getProperties);
router.post('/:id/availability', checkPropertyAvailability);

// 2. THIS MUST GO HERE: Static routes always go above dynamic /:id routes
router.get('/landlord-bookings', protect, restrictTo('LANDLORD', 'ADMIN'), getLandlordBookings);

// Dynamic routes
router.get('/:id', getProperty);
router.patch('/:id', protect, restrictTo('ADMIN', 'LANDLORD'), updateProperty);

export default router;