import mongoose, { Schema, Types } from 'mongoose';

export type RepostDoc = {
  userId: Types.ObjectId;
  threadId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

const RepostSchema = new Schema<RepostDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    threadId: { type: Schema.Types.ObjectId, ref: 'Thread', required: true, index: true },
  },
  { timestamps: true }
);

RepostSchema.index({ userId: 1, threadId: 1 }, { unique: true });

export const RepostModel = mongoose.models.Repost ?? mongoose.model<RepostDoc>('Repost', RepostSchema);
