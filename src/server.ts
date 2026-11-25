import dotenv from 'dotenv';
import { createServer } from 'http';
import { startKeepAlive } from './utils/keepAlive.js';

dotenv.config();

import mongoose from 'mongoose';
import app from './app.js';
import { initializeSupportSocket } from './sockets/support.sockets.js';

const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URI as string;

const startServer = async () => {
  try {
    // Database Connection
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected successfully.');

    // Create native HTTP server wrapping Express so Socket.IO shares the port
    const httpServer = createServer(app);

    // Initialize Support Socket.IO (/support namespace & Redis adapter)
    initializeSupportSocket(httpServer);

    // Start HTTP + WebSocket Server
    httpServer.listen(PORT, () => {
      console.log(`🚀 Rentals API & Support Sockets running on port ${PORT}`);
      startKeepAlive();
    });
  } catch (error) {
    console.error('❌ Failed to start the server:', error);
    process.exit(1);
  }
};

startServer();