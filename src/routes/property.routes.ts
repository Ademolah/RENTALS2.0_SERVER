import { Router } from 'express';
import { 
  createProperty, 
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

// NOTE: Soft-delete or hard-delete endpoints would go here, similarly restricted.

export default router;