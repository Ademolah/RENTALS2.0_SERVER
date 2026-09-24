import { Router } from 'express';
import { 
    listCars, initiateCarBooking, createCar, getCarById, listAllCars, 
    confirmCarHandover, getMyCarBookings, getLandlordCars, 
    getLandlordCarBookings, updateCar 
} from '../controllers/car.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js'; 

const router = Router();

// ==========================================
// 🟢 PUBLIC ROUTES (No Token Required)
// ==========================================
router.get('/', listCars);
router.get('/all', listAllCars);

// 💡 MOVED THIS UP: Anyone can view a car's details
router.get('/:id', getCarById);


// ==========================================
// 🔴 PROTECTED ROUTES BARRICADE
// ==========================================
router.use(protect);


// ==========================================
// 🟡 AUTHENTICATED ROUTES (Requires Token)
// ==========================================
router.get('/my-bookings', getMyCarBookings);
router.post('/book', initiateCarBooking);
router.patch('/reservations/:reservationId/handover', confirmCarHandover);

// ==========================================
// 🟠 LANDLORD & ADMIN ROUTES
// ==========================================
// Add these STATIC routes ABOVE your dynamic routes!
router.get('/landlord/fleet', restrictTo('LANDLORD', 'ADMIN'), getLandlordCars);
router.get('/landlord/bookings', restrictTo('LANDLORD', 'ADMIN'), getLandlordCarBookings);

// Dynamic & Action routes
router.post('/', restrictTo("ADMIN", "LANDLORD"), upload.array('images', 5), createCar);
router.patch('/:id', restrictTo('LANDLORD', 'ADMIN'), updateCar);

export default router;