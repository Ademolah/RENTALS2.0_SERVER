import { Router } from 'express';
import { 
    listCars, initiateCarBooking, createCar, getCarById, listAllCars, 
    confirmCarHandover, getMyCarBookings, getLandlordCars, 
    getLandlordCarBookings, updateCar , checkCarAvailability
} from '../controllers/car.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { propertyMediaUpload } from '../middlewares/upload.middleware.js'; 
import { validateAndHashMedia } from '../middlewares/mediaValidator.middleware.js';

const router = Router();

// ==========================================
// 🟡 STATIC PROTECTED ROUTES (Must go BEFORE /:id)
// ==========================================
// We apply 'protect' inline here so it doesn't get caught by the /:id trap below!
router.get('/my-bookings', protect, getMyCarBookings);

// ==========================================
// 🟢 PUBLIC ROUTES (No Token Required)
// ==========================================
router.get('/', listCars);
router.get('/all', listAllCars);
router.get('/:id', getCarById);
router.post('/:id/availability', checkCarAvailability);


// ==========================================
// 🔒 PROTECTED ROUTES BARRICADE
// ==========================================
router.use(protect);


// ==========================================
// 🟡 AUTHENTICATED ROUTES (Requires Token)
// ==========================================
// (Removed /my-bookings from here since it was moved up)
router.post('/book', initiateCarBooking);
router.patch('/reservations/:reservationId/handover', confirmCarHandover);

// ==========================================
// 👑 LANDLORD & ADMIN ROUTES
// ==========================================
// Add these STATIC routes ABOVE your dynamic routes!
router.get('/landlord/fleet', restrictTo('LANDLORD', 'ADMIN'), getLandlordCars);
router.get('/landlord/bookings', restrictTo('LANDLORD', 'ADMIN'), getLandlordCarBookings);

// Dynamic & Action routes
router.post(
  '/', 
  restrictTo("ADMIN", "LANDLORD"), 
  propertyMediaUpload,    
  validateAndHashMedia,
  createCar
);

router.patch(
  '/:id', 
  restrictTo('LANDLORD', 'ADMIN'),
  propertyMediaUpload,    
  validateAndHashMedia,
  updateCar
);

export default router;