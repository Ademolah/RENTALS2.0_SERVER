import app from './app.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URI as string;

const startServer = async () => {
  try {
    // Database Connection
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected successfully.');

    // Start Express Server
    app.listen(PORT, () => {
      console.log(`🚀 Rentals API is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start the server:', error);
    process.exit(1);
  }
};

startServer();