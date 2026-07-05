import { model, models, Schema, type Document, type Model, type Types } from "mongoose";

export interface IUser extends Document {
  _id: Types.ObjectId;
  username: string;
  displayName: string;
  passwordHash: string;
  role: "admin" | "staff";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["admin", "staff"],
      default: "staff",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { timestamps: true },
);

export const User =
  (models.User as Model<IUser> | undefined) ?? model<IUser>("User", UserSchema);
