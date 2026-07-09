import { NextRequest, NextResponse } from "next/server";
import { escapeRegex, jsonError, parseError, serializeDeposit } from "@/lib/api";
import { verifyAdmin, verifyStaffWrite } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { buildTotalText, getHanoiNow } from "@/lib/time";
import { sendPushToAll } from "@/lib/webpush";
import {
  ballActions,
  cardActions,
  depositAdminCreateSchema,
  depositCreateSchema,
  depositStatuses,
  normalizePhone,
} from "@/lib/validation";
import { CustomerDeposit, type ICustomerDeposit } from "@/models/CustomerDeposit";

const defaultPage = 1;
const defaultLimit = 100;
const maxLimit = 300;
const activeDepositStatus = depositStatuses[0];
const returnedDepositStatus = depositStatuses[1];
const depositCardAction = cardActions[0];
const withdrawCardAction = cardActions[1];
const depositBallAction = ballActions[0];
const withdrawBallAction = ballActions[1];

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

function getHeldCards(deposit: ICustomerDeposit) {
  return deposit.cardAction === withdrawCardAction ? 0 : deposit.cards;
}

function getHeldBalls(deposit: ICustomerDeposit) {
  return deposit.ballAction === withdrawBallAction ? 0 : deposit.balls;
}

function applyHeldTotalsToDeposit(deposit: ICustomerDeposit) {
  const heldCards = getHeldCards(deposit);
  const heldBalls = getHeldBalls(deposit);

  deposit.totalText = buildTotalText(heldCards, heldBalls);

  if (heldCards === 0 && heldBalls === 0) {
    deposit.status = returnedDepositStatus;
  }
}

function buildActionContent({
  balls,
  cards,
  depositDate,
  depositTime,
  isTakingBalls,
  isTakingCards,
  nextBalls,
  nextCards,
}: {
  balls: number;
  cards: number;
  depositDate: string;
  depositTime: string;
  isTakingBalls: boolean;
  isTakingCards: boolean;
  nextBalls: number;
  nextCards: number;
}) {
  const changes = [
    cards > 0 ? `${isTakingCards ? "lấy" : "gửi"} ${cards} thẻ` : "",
    balls > 0 ? `${isTakingBalls ? "lấy" : "gửi"} ${balls} bi` : "",
  ].filter(Boolean);

  return `Tạo bản ghi: ${changes.join(", ") || "không đổi thẻ/bi"}. Ngày giờ thao tác: ${depositTime} ${depositDate}. Tổng đang giữ: ${nextCards} thẻ, ${nextBalls} bi.`;
}

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
        totalCards: {
          $sum: {
            $cond: [{ $ne: ["$cardAction", withdrawCardAction] }, "$cards", 0],
          },
        },
        totalBalls: {
          $sum: {
            $cond: [{ $ne: ["$ballAction", withdrawBallAction] }, "$balls", 0],
          },
        },
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
        totalCards: {
          $sum: {
            $cond: [{ $ne: ["$cardAction", withdrawCardAction] }, "$cards", 0],
          },
        },
        totalBalls: {
          $sum: {
            $cond: [{ $ne: ["$ballAction", withdrawBallAction] }, "$balls", 0],
          },
        },
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
    cardAction: { $ne: withdrawCardAction },
  }).sort({ createdAt: 1 });

  for (const activeDeposit of activeDeposits) {
    if (remainingCards <= 0) {
      break;
    }

    const deductedCards = Math.min(activeDeposit.cards, remainingCards);
    activeDeposit.cards -= deductedCards;
    remainingCards -= deductedCards;

    applyHeldTotalsToDeposit(activeDeposit);
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

async function deductActiveBalls(phone: string, ballsToTake: number, actorName: string) {
  let remainingBalls = ballsToTake;
  const activeDeposits = await CustomerDeposit.find({
    phone,
    status: activeDepositStatus,
    balls: { $gt: 0 },
    ballAction: { $ne: withdrawBallAction },
  }).sort({ createdAt: 1 });

  for (const activeDeposit of activeDeposits) {
    if (remainingBalls <= 0) {
      break;
    }

    const deductedBalls = Math.min(activeDeposit.balls, remainingBalls);
    activeDeposit.balls -= deductedBalls;
    remainingBalls -= deductedBalls;

    applyHeldTotalsToDeposit(activeDeposit);
    activeDeposit.updatedByName = actorName;
    activeDeposit.history.push({
      at: new Date(),
      actorName,
      action: "UPDATE",
      content: `Tự trừ ${deductedBalls} bi do tạo bản ghi lấy bi. Bi còn lại: ${activeDeposit.balls}.`,
    });

    await activeDeposit.save();
  }

  if (remainingBalls > 0) {
    throw new Error("Không đủ bi đang giữ để trừ.");
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

    if (depositDate && !(await verifyAdmin())) {
      return jsonError("Bạn không có quyền lọc dữ liệu theo ngày.", 403);
    }

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

    const isAdminApproved = await verifyAdmin();

    if (isAdminCreate) {
      if (!isAdminApproved) {
        return jsonError("Bạn không có quyền chọn ngày giờ khi tạo bản ghi.", 403);
      }
    } else if (!(await verifyStaffWrite(request))) {
      return jsonError("Mã truy cập nhân viên không hợp lệ.", 403);
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
    const isTakingBalls = data.ballAction === withdrawBallAction;

    if (isTakingCards && data.cards > activeTotal.cards) {
      return jsonError(`Khách chỉ còn ${activeTotal.cards} thẻ đang giữ.`, 400);
    }

    if (isTakingBalls && data.balls > activeTotal.balls) {
      return jsonError(`Khách chỉ còn ${activeTotal.balls} bi đang giữ.`, 400);
    }

    const nextCards = isTakingCards ? activeTotal.cards - data.cards : activeTotal.cards + data.cards;
    const nextBalls = isTakingBalls ? activeTotal.balls - data.balls : activeTotal.balls + data.balls;
    const hasHeldCards = !isTakingCards && data.cards > 0;
    const hasHeldBalls = !isTakingBalls && data.balls > 0;
    const status =
      hasHeldCards || hasHeldBalls || (!isTakingCards && !isTakingBalls)
        ? activeDepositStatus
        : returnedDepositStatus;
    const historyContent = buildActionContent({
      balls: data.balls,
      cards: data.cards,
      depositDate,
      depositTime,
      isTakingBalls,
      isTakingCards,
      nextBalls,
      nextCards,
    });

    const deposit = await CustomerDeposit.create({
      fullName: data.fullName,
      phone: data.phone,
      depositDate,
      depositTime,
      cardAction: data.cardAction ?? depositCardAction,
      ballAction: data.ballAction ?? depositBallAction,
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

    if (isTakingCards && data.cards > 0) {
      await deductActiveCards(data.phone, data.cards, data.actorName);
    }

    if (isTakingBalls && data.balls > 0) {
      await deductActiveBalls(data.phone, data.balls, data.actorName);
    }

    // Build compact push notification body
    const actionParts: string[] = [];
    if (data.cards > 0) {
      actionParts.push(`${isTakingCards ? "Lấy" : "Gửi"} ${data.cards} thẻ`);
    }
    if (data.balls > 0) {
      actionParts.push(`${isTakingBalls ? "Lấy" : "Gửi"} ${data.balls} bi`);
    }
    const shortName = data.fullName.split(" ").slice(-2).join(" ");
    const pushBody = `${shortName} · ${actionParts.join(" + ")} · ${data.actorName} lúc ${depositTime}`;

    // Fire-and-forget — không block response
    void sendPushToAll({
      title: "Ký gửi PINBALL",
      body: pushBody,
      url: "/",
    });

    // Gửi webhook thông báo tới Telegram Bot (nếu có cấu hình)
    const webhookUrl = process.env.TELEGRAM_BOT_WEBHOOK_URL;
    if (webhookUrl) {
      void fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deposit._id.toString(),
          title: `${deposit.fullName} (${deposit.phone})`,
          type: `${actionParts.join(" + ")} (Bởi ${data.actorName} lúc ${depositTime})`,
        }),
      }).catch((err) => {
        console.error("Lỗi gửi webhook tới Telegram Bot:", err.message);
      });
    }

    return NextResponse.json({ deposit: serializeDeposit(deposit) }, { status: 201 });
  } catch (error) {
    return jsonError(parseError(error), 400);
  }
}
