import mongoose, { Schema, Types } from 'mongoose';

export type NotificationType = 'follow' | 'like' | 'comment' | 'repost' | 'post';
export type NotificationEntityType = 'user' | 'thread';

export type NotificationDoc = {
  recipientId: Types.ObjectId;
  actorId: Types.ObjectId;
  type: NotificationType;
  entityType: NotificationEntityType;
  entityId: Types.ObjectId;
  text?: string;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const NotificationSchema = new Schema<NotificationDoc>(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['follow', 'like', 'comment', 'repost', 'post'], required: true },
    entityType: { type: String, enum: ['user', 'thread'], required: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    text: { type: String },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });

export const NotificationModel =
  mongoose.models.Notification ?? mongoose.model<NotificationDoc>('Notification', NotificationSchema);
