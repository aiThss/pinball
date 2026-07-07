import { NextRequest, NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { PushSubscription } from "@/models/PushSubscription";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ message: "Thiếu thông tin subscription." }, { status: 400 });
    }

    await connectMongo();

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { endpoint, p256dh, auth },
      { upsert: true, new: true },
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Lỗi khi lưu subscription." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { endpoint?: string };
    const endpoint = body?.endpoint;

    if (!endpoint) {
      return NextResponse.json({ message: "Thiếu endpoint." }, { status: 400 });
    }

    await connectMongo();
    await PushSubscription.deleteOne({ endpoint });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Lỗi khi xóa subscription." }, { status: 500 });
  }
}
