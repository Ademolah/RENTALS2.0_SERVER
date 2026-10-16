import { Router } from 'express';
import { 
  createProperty, 
  getProperties, 
  getProperty,  
  updateProperty,
  checkPropertyAvailability,
  getLandlordBookings, 
  deleteProperty
} from '../controllers/property.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { propertyMediaUpload, upload } from '../middlewares/upload.middleware.js';
import { validateAndHashMedia } from '../middlewares/mediaValidator.middleware.js';

const router = Router();

// SHORTLET ROUTES ONLY
router.post(
  '/', 
  protect, 
  restrictTo('ADMIN', 'LANDLORD'), 
  propertyMediaUpload,     // 1. Replaces upload.array() to handle both images and 1 video
  validateAndHashMedia,    // 2. Intercepts the buffers to run the anti-duplication algorithm
  createProperty           // 3. Your controller (which now receives req.body.imageHashes)
);
router.get('/', getProperties);
router.post('/:id/availability', checkPropertyAvailability);

router.get('/landlord-bookings', protect, restrictTo('LANDLORD', 'ADMIN'), getLandlordBookings);

router.get('/:id', getProperty);
router.patch('/:id', protect, restrictTo('ADMIN', 'LANDLORD'), propertyMediaUpload, updateProperty);
router.delete('/:id', protect, deleteProperty);

export default router;