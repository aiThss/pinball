import { NextRequest, NextResponse } from "next/server";
import { escapeRegex, jsonError, parseError, serializeDeposit } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { buildTotalText, getHanoiNow } from "@/lib/time";
import { depositCreateSchema, depositStatuses, normalizePhone } from "@/lib/validation";
import { CustomerDeposit } from "@/models/CustomerDeposit";

export async function GET(request: NextRequest) {
  try {
    await connectMongo();

    const searchParams = request.nextUrl.searchParams;
    const filter: Record<string, unknown> = {};
    const name = searchParams.get("name")?.trim();
    const phone = searchParams.get("phone")?.trim();
    const depositDate = searchParams.get("date")?.trim();
    const status = searchParams.get("status")?.trim();

    if (name) {
      filter.fullName = { $regex: escapeRegex(name), $options: "i" };
    }

    if (phone) {
      filter.phone = { $regex: escapeRegex(normalizePhone(phone)), $options: "i" };
    }

    if (depositDate) {
      filter.depositDate = depositDate;
    }

    if (status && depositStatuses.includes(status as (typeof depositStatuses)[number])) {
      filter.status = status;
    }

    const deposits = await CustomerDeposit.find(filter)
      .sort({ createdAt: -1 })
      .limit(300);

    return NextResponse.json({
      deposits: deposits.map(serializeDeposit),
    });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = depositCreateSchema.parse(body);
    const now = getHanoiNow();

    await connectMongo();

    const deposit = await CustomerDeposit.create({
      fullName: data.fullName,
      phone: data.phone,
      depositDate: data.depositDate ?? now.date,
      depositTime: data.depositTime ?? now.time,
      cards: data.cards,
      balls: data.balls,
      totalText: buildTotalText(data.cards, data.balls),
      status: data.status ?? "Đang gửi",
      createdByName: data.actorName,
      updatedByName: data.actorName,
      history: [
        {
          at: new Date(),
          actorName: data.actorName,
          action: "CREATE",
          content: `Tạo bản ghi: ${data.cards} thẻ, ${data.balls} bi.`,
        },
      ],
    });

    return NextResponse.json({ deposit: serializeDeposit(deposit) }, { status: 201 });
  } catch (error) {
    return jsonError(parseError(error), 400);
  }
}
