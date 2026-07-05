import { NextRequest, NextResponse } from "next/server";
import { escapeRegex, jsonError, parseError, serializeDeposit } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { buildTotalText, getHanoiNow } from "@/lib/time";
import { depositCreateSchema, depositStatuses, normalizePhone } from "@/lib/validation";
import { CustomerDeposit } from "@/models/CustomerDeposit";

const defaultPage = 1;
const defaultLimit = 100;
const maxLimit = 300;
const activeDepositStatus = depositStatuses[0];
const canceledDepositStatus = depositStatuses[3];

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

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

    const page = parsePositiveInteger(searchParams.get("page"), defaultPage);
    const limit = Math.min(parsePositiveInteger(searchParams.get("limit"), defaultLimit), maxLimit);
    const skip = (page - 1) * limit;
    const [total, deposits] = await Promise.all([
      CustomerDeposit.countDocuments(filter),
      CustomerDeposit.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);

    return NextResponse.json({
      deposits: deposits.map(serializeDeposit),
      total,
      page,
      limit,
      hasMore: skip + deposits.length < total,
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
    const requestedStatus = data.status ?? activeDepositStatus;

    await connectMongo();

    if (requestedStatus === activeDepositStatus) {
      const matchingDeposits = await CustomerDeposit.find({
        phone: data.phone,
        status: activeDepositStatus,
      }).sort({ createdAt: 1 });
      const [depositToUpdate, ...duplicateDeposits] = matchingDeposits;

      if (depositToUpdate) {
        const existingCards = matchingDeposits.reduce((sum, deposit) => sum + deposit.cards, 0);
        const existingBalls = matchingDeposits.reduce((sum, deposit) => sum + deposit.balls, 0);
        const nextCards = existingCards + data.cards;
        const nextBalls = existingBalls + data.balls;

        depositToUpdate.cards = nextCards;
        depositToUpdate.balls = nextBalls;
        depositToUpdate.totalText = buildTotalText(nextCards, nextBalls);
        depositToUpdate.updatedByName = data.actorName;
        depositToUpdate.history.push({
          at: new Date(),
          actorName: data.actorName,
          action: "UPDATE",
          content: `Cộng thêm theo SĐT ${data.phone}: ${data.cards} thẻ, ${data.balls} bi. Tổng mới: ${nextCards} thẻ, ${nextBalls} bi.${
            duplicateDeposits.length > 0 ? ` Đã gộp ${duplicateDeposits.length} bản ghi trùng SĐT.` : ""
          }`,
        });

        duplicateDeposits.forEach((duplicate) => {
          duplicate.status = canceledDepositStatus;
          duplicate.updatedByName = data.actorName;
          duplicate.history.push({
            at: new Date(),
            actorName: data.actorName,
            action: "UPDATE",
            content: `Gộp vào bản ghi ${depositToUpdate._id} vì trùng SĐT ${data.phone}.`,
          });
        });

        await Promise.all([
          depositToUpdate.save(),
          ...duplicateDeposits.map((deposit) => deposit.save()),
        ]);

        return NextResponse.json({
          deposit: serializeDeposit(depositToUpdate),
          merged: true,
          mergedCount: matchingDeposits.length,
        });
      }
    }

    const deposit = await CustomerDeposit.create({
      fullName: data.fullName,
      phone: data.phone,
      depositDate: data.depositDate ?? now.date,
      depositTime: data.depositTime ?? now.time,
      cards: data.cards,
      balls: data.balls,
      totalText: buildTotalText(data.cards, data.balls),
      status: requestedStatus,
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
