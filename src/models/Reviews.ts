import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IReview extends Document {
  property: Types.ObjectId;
  user: Types.ObjectId;
  rating: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    property: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

// Prevent a user from submitting multiple reviews for the exact same property
reviewSchema.index({ property: 1, user: 1 }, { unique: true });

export default mongoose.model<IReview>('Review', reviewSchema);