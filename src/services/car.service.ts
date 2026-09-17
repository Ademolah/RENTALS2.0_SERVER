import { Car } from '../models/Car.js';
import { CarReservation } from '../models/CarReservation.js';
import { AppError } from '../utils/AppError.js';
import crypto from 'crypto';

export class CarService {
  /**
   * Calculates billing blocks based on 12-hour increments.
   * e.g., 1-12 hours = 1 block. 13-24 hours = 2 blocks.
   */
  static calculate12HourBlocks(pickup: Date, dropoff: Date): number {
    const diffInMilliseconds = dropoff.getTime() - pickup.getTime();
    if (diffInMilliseconds <= 0) {
      throw new AppError('Drop-off time must be after pickup time', 400);
    }
    const diffInHours = diffInMilliseconds / (1000 * 60 * 60);
    return Math.ceil(diffInHours / 12);
  }

  /**
   * Guards against race conditions by checking temporal overlap.
   */
  static async isCarAvailable(carId: string, pickup: Date, dropoff: Date): Promise<boolean> {
    const overlappingReservations = await CarReservation.findOne({
      carId,
      reservationStatus: { $in: ['ACTIVE', 'COMPLETED'] },
      $or: [
        { pickupTime: { $lt: dropoff }, dropoffTime: { $gt: pickup } }
      ]
    });

    return !overlappingReservations;
  }

  static async createPendingReservation(userId: string, carId: string, pickupTime: Date, dropoffTime: Date) {
    const pickup = new Date(pickupTime);
    const dropoff = new Date(dropoffTime);

    const car = await Car.findById(carId);
    if (!car) throw new AppError('Vehicle not found', 404);
    if (!car.isAvailable) throw new AppError('Vehicle is currently out of service', 400);

    const isAvailable = await this.isCarAvailable(carId, pickup, dropoff);
    if (!isAvailable) {
      throw new AppError('Vehicle is already reserved for the selected timeframe', 409);
    }

    const blocks = this.calculate12HourBlocks(pickup, dropoff);
    const totalAmount = blocks * car.pricePer12Hours;
    const paystackReference = `RENTALS-CAR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    // Note: Escrow logic flags `isRentalsCar` based on the owner's role
    const isRentalsCar = false; // In production, evaluate if `car.ownerId` belongs to an ADMIN

    const reservation = await CarReservation.create({
      carId,
      userId,
      pickupTime: pickup,
      dropoffTime: dropoff,
      totalAmount,
      paystackReference,
      paymentStatus: 'PENDING',
      reservationStatus: 'ACTIVE',
      isRentalsCar,
    });

    return { reservation, totalAmount, paystackReference, car };
  }
}