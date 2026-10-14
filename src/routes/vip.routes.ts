import express from 'express';
import { 
  confirmVipArrival,
  createVipEstablishment, 
  createVipService, 
  deleteVipEstablishment, 
  getLandlordVipEstablishments, 
  getVipEstablishmentById, 
  getVipEstablishments, 
  initiateVipReservation, 
  initiateVipServiceBooking, 
  updateVipEstablishment, 
  getVipServices,
  getVipServiceById
} from '../controllers/vip.controller.js';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js'; // Adjust path based on your multer config

const router = express.Router();


router.get('/', getVipEstablishments);
router.get('/services', getVipServices);


router.post(
  '/', 
  protect, 
  restrictTo('LANDLORD', 'ADMIN'), 
  upload.array('images', 10), // Intercepts up to 10 images from the form-data
  createVipEstablishment
);

router.post(
  '/services/reserve', 
  protect, 
  initiateVipServiceBooking
);

router.get('/landlord', protect, restrictTo('LANDLORD', 'ADMIN'), getLandlordVipEstablishments);

router.post(
  '/reserve', 
  protect, 
  initiateVipReservation
);

router.post(
  '/services', 
  protect, 
  restrictTo('LANDLORD', 'ADMIN'), 
  upload.array('images', 5), 
  createVipService
);


// Escrow Confirmation Route (Host marks guest as arrived)
router.post(
  '/confirm-arrival/:id', 
  protect, 
  restrictTo('LANDLORD', 'ADMIN'), 
  confirmVipArrival
);

// Guest Routes
router.post('/reserve', protect,  initiateVipReservation);
router.get('/:id', getVipEstablishmentById);
router.put(
  '/:id', 
  protect, 
  restrictTo('LANDLORD', 'ADMIN'), 
  upload.array('images', 10), 
  updateVipEstablishment
);

router.get('/services/:id', getVipServiceById);
router.delete('/:id', protect, deleteVipEstablishment);


export default router;