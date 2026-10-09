import express, { Router } from 'express';
import { createPropertyReview, getPropertyReviews } from '../controllers/review.controller';
import { protect } from '../middlewares/auth.middleware'; // Ensure this TS middleware handles AuthRequest

const router: Router = express.Router();

router.route('/:propertyId')
  .get(getPropertyReviews)
  .post(protect, createPropertyReview);

export default router;