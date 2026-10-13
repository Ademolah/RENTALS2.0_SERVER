import mongoose, {  Schema } from 'mongoose';
import { INotification } from '../types/index.js';



const NotificationSchema = new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['NEW_BOOKING', 'PAYMENT', 'CHECK_IN', 'PAYOUT', 'CANCELLATION', 'HOST_APPROVAL', 'SYSTEM', 'PICKUP'],
    required: true
  },
  relatedId: { type: Schema.Types.ObjectId },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);