import { model, models, Schema, type Document, type Model, type Types } from "mongoose";
import { ballActions, cardActions, depositStatuses } from "@/lib/validation";

export interface IHistoryEntry {
  at: Date;
  actorId?: Types.ObjectId;
  actorName: string;
  action: "CREATE" | "UPDATE";
  content: string;
}

export interface IWithdrawalAllocation {
  sourceId: Types.ObjectId;
  cards: number;
  balls: number;
}

export interface ICustomerDeposit extends Document {
  _id: Types.ObjectId;
  fullName: string;
  phone: string;
  depositDate: string;
  depositTime: string;
  cardAction: (typeof cardActions)[number];
  ballAction: (typeof ballActions)[number];
  cards: number;
  balls: number;
  remainingCards?: number;
  remainingBalls?: number;
  withdrawalAllocations?: IWithdrawalAllocation[];
  totalText: string;
  status: (typeof depositStatuses)[number];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdByName: string;
  updatedByName: string;
  history: IHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const HistorySchema = new Schema<IHistoryEntry>(
  {
    at: {
      type: Date,
      required: true,
      default: Date.now,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      required: false,
    },
    actorName: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: ["CREATE", "UPDATE"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
  },
  { _id: true },
);

const WithdrawalAllocationSchema = new Schema<IWithdrawalAllocation>(
  {
    sourceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    cards: {
      type: Number,
      required: true,
      min: 0,
    },
    balls: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const CustomerDepositSchema = new Schema<ICustomerDeposit>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    depositDate: {
      type: String,
      required: true,
      index: true,
    },
    depositTime: {
      type: String,
      required: true,
    },
    cardAction: {
      type: String,
      enum: cardActions,
      default: cardActions[0],
      required: true,
      index: true,
    },
    ballAction: {
      type: String,
      enum: ballActions,
      default: ballActions[0],
      required: true,
      index: true,
    },
    cards: {
      type: Number,
      required: true,
      min: 0,
    },
    balls: {
      type: Number,
      required: true,
      min: 0,
    },
    remainingCards: {
      type: Number,
      required: false,
      min: 0,
    },
    remainingBalls: {
      type: Number,
      required: false,
      min: 0,
    },
    withdrawalAllocations: {
      type: [WithdrawalAllocationSchema],
      default: [],
    },
    totalText: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: depositStatuses,
      default: "Đang gửi",
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: false,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      required: false,
    },
    createdByName: {
      type: String,
      required: true,
      default: "Nhân viên",
      trim: true,
    },
    updatedByName: {
      type: String,
      required: true,
      default: "Nhân viên",
      trim: true,
    },
    history: {
      type: [HistorySchema],
      default: [],
    },
  },
  {
    collection: "customers_deposits",
    timestamps: true,
  },
);

CustomerDepositSchema.index({ createdAt: -1 });
CustomerDepositSchema.index({ fullName: "text", phone: "text" });
CustomerDepositSchema.index({ phone: 1, status: 1, createdAt: -1 });

export const CustomerDeposit =
  (models.CustomerDeposit as Model<ICustomerDeposit> | undefined) ??
  model<ICustomerDeposit>("CustomerDeposit", CustomerDepositSchema);
