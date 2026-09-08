import { Reservation } from '../models/Reservation.js';
import { Property } from '../models/Property.js';
import { AppError } from '../utils/AppError.js';
import crypto from 'crypto';

export class ReservationService {
  /**
   * Calculates the number of nights between two dates.
   */
  static calculateNights(checkIn: Date, checkOut: Date): number {
    const diffTime = Math.abs(checkOut.getTime() - checkIn.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Checks if a property is available for the given dates.
   */
  static async isPropertyAvailable(propertyId: string, checkIn: Date, checkOut: Date): Promise<boolean> {
    const overlappingReservations = await Reservation.findOne({
      propertyId,
      reservationStatus: { $in: ['ACTIVE', 'COMPLETED'] },
      $or: [
        { checkInDate: { $lt: checkOut }, checkOutDate: { $gt: checkIn } }
      ]
    });

    return !overlappingReservations;
  }

  /**
   * Creates a pending reservation and generates a unique Paystack reference.
   */
  static async createPendingReservation(userId: string, propertyId: string, checkInDate: Date, checkOutDate: Date, guestsCount: number) {
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (checkIn >= checkOut) {
      throw new AppError('Check-out date must be after check-in date', 400);
    }

    const property = await Property.findById(propertyId);
    if (!property) throw new AppError('Property not found', 404);
    if (!property.isAvailable) throw new AppError('Property is currently unavailable', 400);
    if (guestsCount > property.maxGuests) throw new AppError(`Maximum guests allowed is ${property.maxGuests}`, 400);

    const isAvailable = await this.isPropertyAvailable(propertyId, checkIn, checkOut);
    if (!isAvailable) {
      throw new AppError('Property is already booked for the selected dates', 409);
    }

    const nights = this.calculateNights(checkIn, checkOut);
    const totalAmount = nights * property.pricePerNight;
    
    // Generate a secure, unique reference for Paystack
    const paystackReference = `RENTALS-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    const reservation = await Reservation.create({
      propertyId,
      userId,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      guestsCount,
      totalAmount,
      paystackReference,
      paymentStatus: 'PENDING',
      reservationStatus: 'ACTIVE',
    });

    return { reservation, totalAmount, paystackReference, property };
  }
}