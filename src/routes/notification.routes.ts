import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { 
  savePushToken, 
  getMyNotifications, 
  markAsRead 
} from '../controllers/notification.controller.js';

const router = express.Router();

router.use(protect); // All notification routes require login

router.post('/push-token', savePushToken);
router.get('/', getMyNotifications);
router.patch('/:id/read', markAsRead);

export default router;