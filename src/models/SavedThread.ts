import mongoose, { Schema, Types } from 'mongoose';

export type SavedThreadDoc = {
  userId: Types.ObjectId;
  threadId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

const SavedThreadSchema = new Schema<SavedThreadDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    threadId: { type: Schema.Types.ObjectId, ref: 'Thread', required: true, index: true },
  },
  { timestamps: true }
);

SavedThreadSchema.index({ userId: 1, threadId: 1 }, { unique: true });

export const SavedThreadModel =
  mongoose.models.SavedThread ?? mongoose.model<SavedThreadDoc>('SavedThread', SavedThreadSchema);
