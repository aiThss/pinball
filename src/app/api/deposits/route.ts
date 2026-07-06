import { NextRequest, NextResponse } from "next/server";
import { escapeRegex, jsonError, parseError, serializeDeposit } from "@/lib/api";
import { verifyAdmin } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { buildTotalText, getHanoiNow } from "@/lib/time";
import { cardActions, depositAdminCreateSchema, depositCreateSchema, depositStatuses, normalizePhone } from "@/lib/validation";
import { CustomerDeposit, type ICustomerDeposit } from "@/models/CustomerDeposit";

const defaultPage = 1;
const defaultLimit = 100;
const maxLimit = 300;
const activeDepositStatus = depositStatuses[0];
const returnedDepositStatus = depositStatuses[1];
const depositCardAction = cardActions[0];
const withdrawCardAction = cardActions[1];

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

type ActiveTotal = {
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

async function getActiveTotalByPhone(phone: string) {
  const [activeTotal] = await CustomerDeposit.aggregate<ActiveTotal>([
    { $match: { phone, status: activeDepositStatus } },
    {
      $group: {
        _id: null,
        totalCards: { $sum: "$cards" },
        totalBalls: { $sum: "$balls" },
      },
    },
  ]);

  return {
    cards: activeTotal?.totalCards ?? 0,
    balls: activeTotal?.totalBalls ?? 0,
  };
}

async function deductActiveCards(phone: string, cardsToTake: number, actorName: string) {
  let remainingCards = cardsToTake;
  const activeDeposits = await CustomerDeposit.find({
    phone,
    status: activeDepositStatus,
    cards: { $gt: 0 },
  }).sort({ createdAt: 1 });

  for (const activeDeposit of activeDeposits) {
    if (remainingCards <= 0) {
      break;
    }

    const deductedCards = Math.min(activeDeposit.cards, remainingCards);
    activeDeposit.cards -= deductedCards;
    remainingCards -= deductedCards;

    if (activeDeposit.cards === 0 && activeDeposit.balls === 0) {
      activeDeposit.status = returnedDepositStatus;
    }

    activeDeposit.totalText = buildTotalText(activeDeposit.cards, activeDeposit.balls);
    activeDeposit.updatedByName = actorName;
    activeDeposit.history.push({
      at: new Date(),
      actorName,
      action: "UPDATE",
      content: `Tự trừ ${deductedCards} thẻ do tạo bản ghi lấy thẻ. Thẻ còn lại: ${activeDeposit.cards}.`,
    });

    await activeDeposit.save();
  }

  if (remainingCards > 0) {
    throw new Error("Không đủ thẻ đang giữ để trừ.");
  }
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

    const activeTotal = await getActiveTotalByPhone(data.phone);
    const isTakingCards = data.cardAction === withdrawCardAction;

    if (isTakingCards && data.cards === 0) {
      return jsonError("Vui lòng nhập số thẻ cần lấy.", 400);
    }

    if (isTakingCards && data.balls > 0) {
      return jsonError("Tùy chọn Lấy thẻ chỉ áp dụng cho thẻ. Vui lòng để bi bằng 0.", 400);
    }

    if (isTakingCards && data.cards > activeTotal.cards) {
      return jsonError(`Khách chỉ còn ${activeTotal.cards} thẻ đang giữ.`, 400);
    }

    const nextCards = isTakingCards ? activeTotal.cards - data.cards : activeTotal.cards + data.cards;
    const nextBalls = activeTotal.balls + (isTakingCards ? 0 : data.balls);
    const status = isTakingCards ? returnedDepositStatus : activeDepositStatus;
    const historyContent = isTakingCards
      ? `Tạo bản ghi: lấy ${data.cards} thẻ. Ngày giờ lấy: ${depositTime} ${depositDate}. Tổng đang giữ: ${nextCards} thẻ, ${nextBalls} bi.`
      : `Tạo bản ghi: thêm ${data.cards} thẻ, ${data.balls} bi. Ngày giờ gửi: ${depositTime} ${depositDate}. Tổng đang giữ: ${nextCards} thẻ, ${nextBalls} bi.`;

    const deposit = await CustomerDeposit.create({
      fullName: data.fullName,
      phone: data.phone,
      depositDate,
      depositTime,
      cardAction: data.cardAction ?? depositCardAction,
      cards: data.cards,
      balls: data.balls,
      totalText: buildTotalText(nextCards, nextBalls),
      status,
      createdByName: data.actorName,
      updatedByName: data.actorName,
      history: [
        {
          at: new Date(),
          actorName: data.actorName,
          action: "CREATE",
          content: historyContent,
        },
      ],
    });

    if (isTakingCards) {
      await deductActiveCards(data.phone, data.cards, data.actorName);
    }

    return NextResponse.json({ deposit: serializeDeposit(deposit) }, { status: 201 });
  } catch (error) {
    return jsonError(parseError(error), 400);
  }
}
