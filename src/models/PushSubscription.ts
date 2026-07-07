import { model, models, Schema, type Document, type Model } from "mongoose";

export interface IPushSubscription extends Document {
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    endpoint: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    p256dh: {
      type: String,
      required: true,
    },
    auth: {
      type: String,
      required: true,
    },
  },
  {
    collection: "push_subscriptions",
    timestamps: true,
  },
);

export const PushSubscription =
  (models.PushSubscription as Model<IPushSubscription> | undefined) ??
  model<IPushSubscription>("PushSubscription", PushSubscriptionSchema);
