import { Router } from 'express';
import { 
  registerUser, 
  loginUser, 
  resetPassword, 
  forgotPassword, 
  loginLimiter 
} from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', registerUser);
// Add loginLimiter as middleware before loginUser
router.post('/login', loginLimiter, loginUser);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;