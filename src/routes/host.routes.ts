import { Router } from 'express';
import { 
  submitHostApplication, 
  processHostApplication, 
  getHostApplications, 
  checkApplicationStatus, 
  getHostEarningsAnalytics // INJECTED
} from '../controllers/host.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js'; 

const router = Router();

// Guest/User routes
router.post('/apply', protect, submitHostApplication);

// Admin routes
router.get('/requests', protect, restrictTo('ADMIN'), getHostApplications);
router.get('/status', protect, checkApplicationStatus);
router.patch('/requests/:id', protect, restrictTo('ADMIN'), processHostApplication);

// INJECTED: Host Analytics Route
router.get('/analytics', protect, restrictTo('LANDLORD', 'ADMIN'), getHostEarningsAnalytics);

export default router;