import { Router } from 'express';
import { 
  submitHostApplication, 
  processHostApplication, 
  getHostApplications 
} from '../controllers/host.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js'; 

const router = Router();

// Guest/User routes
router.post('/apply', protect, submitHostApplication);

// Admin routes
router.get('/requests', protect, restrictTo('ADMIN'), getHostApplications);
router.patch('/requests/:id', protect, restrictTo('ADMIN'), processHostApplication);

export default router;