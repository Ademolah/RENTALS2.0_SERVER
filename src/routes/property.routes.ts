import { Router } from 'express';
import { 
  createProperty, 
  getProperties, 
  getProperty,  
  updateProperty,
  checkPropertyAvailability,
  getLandlordBookings 
} from '../controllers/property.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';

const router = Router();

// SHORTLET ROUTES ONLY
router.post('/', protect, restrictTo('ADMIN', 'LANDLORD'), upload.array('images', 10), createProperty);
router.get('/', getProperties);
router.post('/:id/availability', checkPropertyAvailability);

router.get('/landlord-bookings', protect, restrictTo('LANDLORD', 'ADMIN'), getLandlordBookings);

router.get('/:id', getProperty);
router.patch('/:id', protect, restrictTo('ADMIN', 'LANDLORD'), updateProperty);

export default router;