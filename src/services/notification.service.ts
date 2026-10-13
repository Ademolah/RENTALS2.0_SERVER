import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import mongoose from 'mongoose';

export class NotificationService {
  /**
   * Internal method to send a push notification and save it to the database history.
   */
  static async sendPush(
    userId: string | mongoose.Types.ObjectId,
    title: string,
    body: string,
    type: 'NEW_BOOKING' | 'PAYMENT' | 'CHECK_IN' | 'PAYOUT' | 'CANCELLATION' | 'HOST_APPROVAL' | 'SYSTEM' | 'PICKUP',
    relatedId?: string | mongoose.Types.ObjectId
  ) {
    try {
      // 1. Save to Database for the "History" tab in the app
      // FIX: Use conditional spreading so 'relatedId: undefined' is never passed
      await Notification.create({
        userId,
        title,
        body,
        type,
        ...(relatedId ? { relatedId } : {}) 
      });

      // 2. Fetch the user's saved push tokens
      const user = await User.findById(userId).select('pushTokens');
      
      if (!user || !user.pushTokens || user.pushTokens.length === 0) {
        return; // User has no registered devices, gracefully exit
      }

      // 3. Broadcast to all of the user's devices
      // NOTE: Insert your push provider logic here (e.g., Firebase Admin SDK or Expo Push SDK)
      const tokens = user.pushTokens;
      
      console.log(`[PUSH INITIATED] To ${tokens.length} devices for User ${userId}`);
      console.log(`[PUSH PAYLOAD] Title: ${title} | Body: ${body}`);
      
      /* 
       * EXAMPLE FIREBASE (FCM) IMPLEMENTATION:
       * 
       * const message = {
       *   notification: { title, body },
       *   data: { type, relatedId: relatedId?.toString() || '' },
       *   tokens: tokens
       * };
       * await firebaseAdmin.messaging().sendMulticast(message);
       */

    } catch (error) {
      console.error('Failed to send push notification:', error);
    }
  }
}