import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { 
  getAvailableBanks, 
  verifyBankAccount, 
  saveLandlordBankDetails , processLandlordPayout
} from '../controllers/payout.controller';

const router = Router();

// Must be logged in to interact with financial routes
router.use(protect);
// Optional: If only landlords need this, uncomment below
// router.use(restrictTo('LANDLORD', 'ADMIN'));

router.get('/banks', restrictTo('ADMIN', 'LANDLORD'), getAvailableBanks);
router.post('/banks/verify', restrictTo('ADMIN', 'LANDLORD'), verifyBankAccount);
router.post('/banks/save', restrictTo('ADMIN', 'LANDLORD'), saveLandlordBankDetails);

router.post('/execute/:bookingId', restrictTo('ADMIN', 'LANDLORD'), processLandlordPayout);

export default router;