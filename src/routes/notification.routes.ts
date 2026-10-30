import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { 
  savePushToken, 
  getMyNotifications, 
  markAsRead,
  markAllAsRead,
  removePushToken,
  deleteNotification,
  deleteAllNotifications
} from '../controllers/notification.controller.js';

const router = express.Router();

router.use(protect); // All notification routes require login

router.post('/push-token', savePushToken);
router.delete('/push-token', removePushToken); 
router.get('/', getMyNotifications);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);
router.delete('/clear-all', deleteAllNotifications);
router.delete('/:id', deleteNotification);

export default router;