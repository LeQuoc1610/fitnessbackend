import mongoose, { Schema, Types } from 'mongoose';

export type FollowDoc = {
  followerId: Types.ObjectId;
  followingId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

const FollowSchema = new Schema<FollowDoc>(
  {
    followerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    followingId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

export const FollowModel = mongoose.models.Follow ?? mongoose.model<FollowDoc>('Follow', FollowSchema);
