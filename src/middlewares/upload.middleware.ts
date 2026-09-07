import multer from 'multer';
import { AppError } from '../utils/AppError.js';

// Store files in memory as Buffers so we can stream them directly to Cloudinary
const storage = multer.memoryStorage();

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {

  // 1. Check if the mimetype starts with image/
  const isImageMime = file.mimetype.startsWith('image/');
  
  // 2. Also check the file extension as a fallback for quirky browser downloads
  const isImageExtension = /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(file.originalname);

  if (isImageMime || isImageExtension) {
    // Force fix the mimetype to image/jpeg if it came in as an octet-stream 
    // so Cloudinary handles it correctly downstream
    if (file.mimetype === 'application/octet-stream' && file.originalname.endsWith('.jpeg')) {
      file.mimetype = 'image/jpeg';
    } else if (file.mimetype === 'application/octet-stream' && file.originalname.endsWith('.png')) {
      file.mimetype = 'image/png';
    }

    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400));
  }
};


export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per image for premium quality without bloat
  },
});