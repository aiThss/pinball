import { NextRequest, NextResponse } from "next/server";
import { escapeRegex, jsonError, parseError, serializeDeposit } from "@/lib/api";
import { verifyAdmin } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { buildTotalText, getHanoiNow } from "@/lib/time";
import { depositAdminCreateSchema, depositCreateSchema, depositStatuses, normalizePhone } from "@/lib/validation";
import { CustomerDeposit, type ICustomerDeposit } from "@/models/CustomerDeposit";

const defaultPage = 1;
const defaultLimit = 100;
const maxLimit = 300;
const activeDepositStatus = depositStatuses[0];

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

type PhoneTotal = {
  _id: string;
  totalCards: number;
  totalBalls: number;
};

async function getActiveTotalsByPhone(phones: string[]) {
  const uniquePhones = [...new Set(phones.filter(Boolean))];

  if (uniquePhones.length === 0) {
    return new Map<string, { cards: number; balls: number }>();
  }

  const totals = await CustomerDeposit.aggregate<PhoneTotal>([
    { $match: { phone: { $in: uniquePhones }, status: activeDepositStatus } },
    {
      $group: {
        _id: "$phone",
        totalCards: { $sum: "$cards" },
        totalBalls: { $sum: "$balls" },
      },
    },
  ]);

  return new Map(
    totals.map((total) => [
      total._id,
      {
        cards: total.totalCards,
        balls: total.totalBalls,
      },
    ]),
  );
}

function serializeWithActiveTotal(
  deposit: ICustomerDeposit,
  totalsByPhone: Map<string, { cards: number; balls: number }>,
) {
  const total = totalsByPhone.get(deposit.phone);

  if (deposit.status !== activeDepositStatus || !total) {
    return serializeDeposit(deposit);
  }

  return serializeDeposit(deposit, {
    totalText: buildTotalText(total.cards, total.balls),
  });
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
    const totalsByPhone = await getActiveTotalsByPhone(deposits.map((deposit) => deposit.phone));

    return NextResponse.json({
      deposits: deposits.map((deposit) => serializeWithActiveTotal(deposit, totalsByPhone)),
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
    const now = getHanoiNow();
    const rawData =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const isAdminCreate =
      Object.prototype.hasOwnProperty.call(rawData, "depositDate") ||
      Object.prototype.hasOwnProperty.call(rawData, "depositTime");

    if (isAdminCreate) {
      const isApproved = await verifyAdmin();
      if (!isApproved) {
        return jsonError("Bạn không có quyền chọn ngày giờ khi tạo bản ghi.", 403);
      }
    }

    const data = isAdminCreate
      ? depositAdminCreateSchema.parse(body)
      : depositCreateSchema.parse(body);
    let depositDate = now.date;
    let depositTime = now.time;

    if (isAdminCreate) {
      const adminData = depositAdminCreateSchema.parse(body);
      depositDate = adminData.depositDate;
      depositTime = adminData.depositTime;
    }

    await connectMongo();

    const [activeTotal] = await CustomerDeposit.aggregate<{
      totalCards: number;
      totalBalls: number;
    }>([
      { $match: { phone: data.phone, status: activeDepositStatus } },
      {
        $group: {
          _id: null,
          totalCards: { $sum: "$cards" },
          totalBalls: { $sum: "$balls" },
        },
      },
    ]);
    const nextCards = (activeTotal?.totalCards ?? 0) + data.cards;
    const nextBalls = (activeTotal?.totalBalls ?? 0) + data.balls;

    const deposit = await CustomerDeposit.create({
      fullName: data.fullName,
      phone: data.phone,
      depositDate,
      depositTime,
      cards: data.cards,
      balls: data.balls,
      totalText: buildTotalText(nextCards, nextBalls),
      status: activeDepositStatus,
      createdByName: data.actorName,
      updatedByName: data.actorName,
      history: [
        {
          at: new Date(),
          actorName: data.actorName,
          action: "CREATE",
          content: `Tạo bản ghi: thêm ${data.cards} thẻ, ${data.balls} bi. Ngày giờ gửi: ${depositTime} ${depositDate}. Tổng đang giữ: ${nextCards} thẻ, ${nextBalls} bi.`,
        },
      ],
    });

    return NextResponse.json({ deposit: serializeDeposit(deposit) }, { status: 201 });
  } catch (error) {
    return jsonError(parseError(error), 400);
  }
}
