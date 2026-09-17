import { Router } from 'express';
import { listCars, initiateCarBooking, createCar, getCarById, listAllCars, confirmCarHandover } from '../controllers/car.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js'; // 💡 1. IMPORT YOUR EXISTING MULTER MIDDLEWARE

const router = Router();

router.get('/', listCars);
router.get('/all', listAllCars);
router.get('/:id', getCarById);

router.use(protect);

// 💡 2. ADD upload.array('images', 5) RIGHT HERE BEFORE createCar
router.patch('/reservations/:reservationId/handover',  confirmCarHandover);
router.post('/', restrictTo("ADMIN", "LANDLORD"), upload.array('images', 5), createCar);

router.post('/book', initiateCarBooking);

export default router;
