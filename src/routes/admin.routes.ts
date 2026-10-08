import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js'; 
import {
  getDashboardStats,
  getEscrowLedger,
  getAssetOversight,
  toggleAssetStatus
} from '../controllers/admin.controller.js';

// Optional: Import your host application routes here if you want to centralize them under /api/admin
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
router.patch('/assets/:assetType/:assetId', toggleAssetStatus);

// 4. Host Applications (Imported from Host Controller for centralized Admin API routing)
router.get('/host-applications', getHostApplications);
router.patch('/host-applications/:id', processHostApplication);


export default router;