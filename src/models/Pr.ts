import mongoose, { Schema, Types } from 'mongoose';

export type PrDoc = {
  userId: Types.ObjectId;
  exercise: string;
  weightKg: number;
  achievedAt: Date;
  isNewFlag: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const PrSchema = new Schema<PrDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    exercise: { type: String, required: true },
    weightKg: { type: Number, required: true },
    achievedAt: { type: Date, required: true },
    isNewFlag: { type: Boolean, default: false },
  },
  { timestamps: true }
);

PrSchema.index({ userId: 1, achievedAt: -1 });

export const PrModel = mongoose.models.Pr ?? mongoose.model<PrDoc>('Pr', PrSchema);
