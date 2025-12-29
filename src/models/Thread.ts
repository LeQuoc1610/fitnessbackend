import mongoose, { Schema, Types } from 'mongoose';

export type ThreadMedia = {
  type: 'image' | 'video';
  url: string;
  width?: number;
  height?: number;
  duration?: number;
};
export type ThreadFitness = { chips: string[]; line?: string; pr?: boolean };

export type ThreadDoc = {
  authorId: Types.ObjectId;
  text: string;
  tags: string[];
  media: ThreadMedia[];
  fitness?: ThreadFitness;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  likedBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
};

const ThreadSchema = new Schema<ThreadDoc>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, default: '' },
    tags: { type: [String], default: [] },
    media: {
      type: [
        {
          type: { type: String, enum: ['image', 'video'], required: true },
          url: { type: String, required: true },
          width: { type: Number },
          height: { type: Number },
          duration: { type: Number },
        },
      ],
      default: [],
    },
    fitness: {
      type: {
        chips: { type: [String], default: [] },
        line: { type: String },
        pr: { type: Boolean },
      },
      required: false,
    },
    likeCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    repostCount: { type: Number, default: 0 },
    likedBy: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true }
);

ThreadSchema.index({ createdAt: -1 });

export const ThreadModel = mongoose.models.Thread ?? mongoose.model<ThreadDoc>('Thread', ThreadSchema);
