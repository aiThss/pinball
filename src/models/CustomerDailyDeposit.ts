import { model, models, Schema, type Document, type Model, type Types } from "mongoose";

export interface ICustomerDailyDeposit extends Document {
  _id: Types.ObjectId;
  date: string;
  fullName: string;
  phone: string;
  records: number;
  cardsDeposited: number;
  ballsDeposited: number;
  cardsWithdrawn: number;
  ballsWithdrawn: number;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerDailyDepositSchema = new Schema<ICustomerDailyDeposit>(
  {
    date: {
      type: String,
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    records: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    cardsDeposited: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    ballsDeposited: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    cardsWithdrawn: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    ballsWithdrawn: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    collection: "customers_daily_deposits",
    timestamps: true,
  },
);

CustomerDailyDepositSchema.index({ date: 1, phone: 1 }, { unique: true });
CustomerDailyDepositSchema.index({ date: 1, cardsDeposited: -1, ballsDeposited: -1 });

export const CustomerDailyDeposit =
  (models.CustomerDailyDeposit as Model<ICustomerDailyDeposit> | undefined) ??
  model<ICustomerDailyDeposit>("CustomerDailyDeposit", CustomerDailyDepositSchema);
