import dotenv from 'dotenv';
import { startKeepAlive } from './utils/keepAlive.js';

dotenv.config()

import app from './app.js';
import mongoose from 'mongoose';



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
      startKeepAlive();
    });
  } catch (error) {
    console.error('❌ Failed to start the server:', error);
    process.exit(1);
  }
};

startServer();