import { Router } from 'express';
import { 
  createProperty, getProperties, getProperty,  
  updateProperty
} from '../controllers/property.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';

const router = Router();

import { upload } from '../middlewares/upload.middleware.js';

// Add the upload middleware before the controller. Max 10 images.
router.post(
  '/', 
  protect,
  restrictTo('ADMIN', 'LANDLORD'), 
  upload.array('images', 10), 
  createProperty
);

router.get('/', getProperties);
router.get('/:id', getProperty);
router.patch('/:id', protect, restrictTo('ADMIN', 'LANDLORD'), updateProperty);

// NOTE: Soft-delete or hard-delete endpoints would go here, similarly restricted.

export default router;