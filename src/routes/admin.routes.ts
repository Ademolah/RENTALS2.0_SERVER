import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js'; 
import {
  getDashboardStats,
  getEscrowLedger,
  getAssetOversight,
  toggleAssetStatus,
  updateAssetApprovalStatus // 💡 NEW IMPORT
} from '../controllers/admin.controller.js';

import { getHostApplications, processHostApplication } from '../controllers/host.controller.js';

const router = Router();

// ==========================================
// ALL ROUTES REQUIRE ADMIN PRIVILEGES
// ==========================================
router.use(protect);
router.use(restrictTo('ADMIN'));

// 1. Dashboard Overview
router.get('/stats', getDashboardStats);

// 2. Escrow & Booking Ledger
router.get('/ledger', getEscrowLedger);

// 3. Asset Oversight
router.get('/assets', getAssetOversight);

// Legacy toggle (for verifying/availability)
router.patch('/assets/:assetType/:assetId', toggleAssetStatus);

// 💡 NEW: The dedicated route for approving or rejecting a listing
router.patch('/assets/:assetType/:assetId/approval', updateAssetApprovalStatus);

// 4. Host Applications
router.get('/host-applications', getHostApplications);
router.patch('/host-applications/:id', processHostApplication);

export default router;