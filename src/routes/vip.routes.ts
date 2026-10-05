import express from 'express';
import { 
  createVipEstablishment, 
  getVipEstablishments, 
  initiateVipReservation 
} from '../controllers/vip.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js'; // Adjust path based on your multer config

const router = express.Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================
// GET /api/vip - Fetch all VIP establishments for the guest dashboard
router.get('/', getVipEstablishments);

// ==========================================
// PROTECTED ROUTES (HOSTS & ADMINS)
// ==========================================
// POST /api/vip - Create a new VIP establishment
router.post(
  '/', 
  protect, 
  restrictTo('LANDLORD', 'ADMIN'), 
  upload.array('images', 10), // Intercepts up to 10 images from the form-data
  createVipEstablishment
);

// ==========================================
// PROTECTED ROUTES (GUESTS)
// ==========================================
// POST /api/vip/reserve - Initiate the deposit escrow and Paystack checkout
router.post(
  '/reserve', 
  protect, 
  initiateVipReservation
);

export default router;