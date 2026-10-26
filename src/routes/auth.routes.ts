import { Router } from 'express';
import { 
  registerUser, 
  loginUser, 
  resetPassword, 
  forgotPassword, 
  loginLimiter, 
  verifyEmail,
  googleSignIn,
  appleSignIn
} from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', registerUser);
router.post('/login', loginLimiter, loginUser);
router.post('/verify-email', verifyEmail);

// Social Auth Endpoints
router.post('/google', googleSignIn);
router.post('/apple', appleSignIn);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;