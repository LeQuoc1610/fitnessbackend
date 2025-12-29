import mongoose, { Schema, Types } from 'mongoose';

export type WorkoutExercise = { name: string; sets?: string };

export type WorkoutDoc = {
  userId: Types.ObjectId;
  date: Date;
  durationMinutes: number;
  exercises: WorkoutExercise[];
  createdAt: Date;
  updatedAt: Date;
};

const WorkoutSchema = new Schema<WorkoutDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true },
    exercises: { type: [{ name: { type: String, required: true }, sets: { type: String } }], default: [] },
  },
  { timestamps: true }
);

WorkoutSchema.index({ userId: 1, date: -1 });

export const WorkoutModel = mongoose.models.Workout ?? mongoose.model<WorkoutDoc>('Workout', WorkoutSchema);
