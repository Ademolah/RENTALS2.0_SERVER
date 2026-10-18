import multer from 'multer';
import { AppError } from '../utils/AppError.js';

// Store files in memory as Buffers so we can stream them directly to Cloudinary[cite: 8]
const storage = multer.memoryStorage();

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const isImageMime = file.mimetype.startsWith('image/');
  const isVideoMime = file.mimetype.startsWith('video/');
  
  const isImageExtension = /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(file.originalname);
  const isVideoExtension = /\.(mp4|mov|quicktime|webm)$/i.test(file.originalname);

  if (isImageMime || isImageExtension || isVideoMime || isVideoExtension) {
    if (file.mimetype === 'application/octet-stream') {
      if (file.originalname.endsWith('.jpeg') || file.originalname.endsWith('.jpg')) file.mimetype = 'image/jpeg';
      else if (file.originalname.endsWith('.png')) file.mimetype = 'image/png';
      else if (file.originalname.endsWith('.mp4')) file.mimetype = 'video/mp4';
    }
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type! Please upload only images or allowed video formats.', 400));
  }
};

// 💡 FIX: Global limit increased to 50MB to allow the video. 
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max overall
  },
});

// 💡 NEW: Export specialized field interceptors
export const propertyMediaUpload = upload.fields([
  { name: 'images', maxCount: 15 }, 
  { name: 'video', maxCount: 1 }    
]);