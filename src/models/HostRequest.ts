import mongoose, { Document, Schema } from 'mongoose';

export interface IHostRequest extends Document {
  user: mongoose.Types.ObjectId;
  address: string;
  city: string;
  state: string;
  nin: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const hostRequestSchema = new Schema<IHostRequest>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  address: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  nin: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  adminNotes: {
    type: String,
    default: ''
  }
}, { timestamps: true });

export default mongoose.model<IHostRequest>('HostRequest', hostRequestSchema);