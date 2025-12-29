import mongoose, { Schema, Types } from 'mongoose';

export type CommentDoc = {
  threadId: Types.ObjectId;
  parentCommentId?: Types.ObjectId | null;
  authorId: Types.ObjectId;
  text: string;
  likeCount: number;
  likedBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
};

const CommentSchema = new Schema<CommentDoc>(
  {
    threadId: { type: Schema.Types.ObjectId, ref: 'Thread', required: true, index: true },
    parentCommentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, required: true },
    likeCount: { type: Number, default: 0 },
    likedBy: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true }
);

CommentSchema.index({ createdAt: -1 });
CommentSchema.index({ threadId: 1, parentCommentId: 1, createdAt: -1 });

export const CommentModel = mongoose.models.Comment ?? mongoose.model<CommentDoc>('Comment', CommentSchema);
