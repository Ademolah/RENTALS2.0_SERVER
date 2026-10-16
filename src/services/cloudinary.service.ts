import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream'; 
import 'multer'; 

// 🛑 REMOVED the global configuration block from here!


export class CloudinaryService {
  /**
   * Uploads a single file buffer to Cloudinary via streams.
   */
  static uploadImageBuffer(fileBuffer: Buffer, folder: string = 'rentals/properties'): Promise<string> {
    
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
      api_key: process.env.CLOUDINARY_API_KEY || '',
      api_secret: process.env.CLOUDINARY_API_SECRET || '',
    });

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error, result) => {
          if (error) return reject(error);
          if (result) return resolve(result.secure_url);
        }
      );
      
      const stream = new Readable();
      stream.push(fileBuffer);
      stream.push(null);
      stream.pipe(uploadStream);
    });
  }

  /**
   * Uploads a single video buffer to Cloudinary via streams.
   */
  static uploadVideoBuffer(fileBuffer: Buffer, folder: string = 'rentals/properties/videos'): Promise<string> {
    
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
      api_key: process.env.CLOUDINARY_API_KEY || '',
      api_secret: process.env.CLOUDINARY_API_SECRET || '',
    });

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        // 💡 CRITICAL: resource_type MUST be 'video' for MP4/MOV files
        { folder, resource_type: 'video' }, 
        (error, result) => {
          if (error) return reject(error);
          if (result) return resolve(result.secure_url);
        }
      );
      
      const stream = new Readable();
      stream.push(fileBuffer);
      stream.push(null);
      stream.pipe(uploadStream);
    });
  }

  /**
   * Concurrently uploads multiple images and returns an array of secure URLs.
   */
  static async uploadMultipleImages(files: Express.Multer.File[]): Promise<string[]> {
    const uploadPromises = files.map((file) => this.uploadImageBuffer(file.buffer));
    return Promise.all(uploadPromises);
  }

  /**
   * Uploads a single video Multer file and returns the secure URL.
   */
  static async uploadVideo(file: Express.Multer.File): Promise<string> {
    return this.uploadVideoBuffer(file.buffer);
  }
}