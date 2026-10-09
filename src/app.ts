import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes.js';
import propertyRoutes from "./routes/property.routes.js"
import carRoutes from './routes/car.routes.js';
import payoutRoutes from './routes/payout.routes.js'
import reservationRoutes from './routes/reservation.routes.js';
import { globalErrorHandler } from './middlewares/errorHandler';
import hotelRoutes from './routes/hotel.routes.js'
import userRoutes from './routes/user.routes.js'
import vipRoutes from './routes/vip.routes.js';
import hostRoutes from './routes/host.routes.js';
import adminRoutes from './routes/admin.routes.js';
import reviewRoutes from './routes/reviews.routes.js'; // Import the review routes

const app: Application = express();

// Global Middlewares
app.use(helmet()); // Security headers
app.use(cors());
app.use(express.json());
app.use(morgan('dev')); // HTTP request logger



app.use("/api/v1/auth", authRoutes)
app.use('/api/v1/reviews', reviewRoutes); 
app.use("/api/v1/admin", adminRoutes) 
app.use('/api/v1/hosts', hostRoutes);
app.use('/api/v1/vip', vipRoutes);
app.use("/api/v1/users", userRoutes)
app.use("/api/v1/properties", propertyRoutes)
app.use('/api/v1/hotels', hotelRoutes);
app.use("/api/v1/cars", carRoutes)
app.use("/api/v1/reservations", reservationRoutes)
app.use('/api/v1/payouts', payoutRoutes)


app.use(globalErrorHandler); // Global error handler

// Health Check Route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'success', message: 'Rentals API is operational.' });
});

// Global Error Handler Guard
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  });
});

export default app;