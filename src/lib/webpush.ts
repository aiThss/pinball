import webpush from "web-push";
import { connectMongo } from "@/lib/mongodb";
import { PushSubscription } from "@/models/PushSubscription";

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL;

  if (!publicKey || !privateKey || !email) {
    throw new Error("Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_EMAIL env vars.");
  }

  webpush.setVapidDetails(email, publicKey, privateKey);
  vapidConfigured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
};

/**
 * Fire-and-forget: gửi push tới tất cả subscriptions.
 * Subscriptions lỗi 410 (gone) sẽ bị xóa tự động.
 */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  try {
    ensureVapid();
    await connectMongo();

    const subscriptions = await PushSubscription.find({}).lean();

    if (subscriptions.length === 0) return;

    const data = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? "/",
      icon: payload.icon ?? "/icons/icon-192.png",
      badge: payload.badge ?? "/icons/badge-96.png",
    });

    const expiredEndpoints: string[] = [];

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            data,
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          // 410 Gone = subscription đã bị thu hồi, xóa khỏi DB
          if (statusCode === 410 || statusCode === 404) {
            expiredEndpoints.push(sub.endpoint);
          }
        }
      }),
    );

    if (expiredEndpoints.length > 0) {
      await PushSubscription.deleteMany({ endpoint: { $in: expiredEndpoints } });
    }
  } catch {
    // Push không được block luồng chính
  }
}
