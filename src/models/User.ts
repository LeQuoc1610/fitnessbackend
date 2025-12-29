import mongoose, { Schema } from 'mongoose';

export type UserDoc = {
  email: string;
  passwordHash: string;
  displayName: string;
  bio?: string;
  photoURL?: string;
  createdAt: Date;
  updatedAt: Date;
};

const UserSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },
    bio: { type: String },
    photoURL: { type: String },
  },
  { timestamps: true }
);

export const UserModel = mongoose.models.User ?? mongoose.model<UserDoc>('User', UserSchema);
