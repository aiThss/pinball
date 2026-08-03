import { NextRequest, NextResponse } from "next/server";
import { jsonError, parseError } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { verifyTelegramBotBearer } from "@/lib/telegram";
import { ballActions, cardActions, depositStatuses } from "@/lib/validation";
import { CustomerDeposit } from "@/models/CustomerDeposit";

const depositCardAction = cardActions[0];
const depositBallAction = ballActions[0];
const canceledDepositStatus = depositStatuses[3];

type DailyReportTotals = {
  _id: null;
  totalRecords: number;
  uniqueCustomers: string[];
  cardsDeposited: number;
  ballsDeposited: number;
};

type CustomerDailyReport = {
  _id: string;
  fullName: string;
  cardsDeposited: number;
  ballsDeposited: number;
};

function getHanoiDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

export async function GET(request: NextRequest) {
  try {
    if (!verifyTelegramBotBearer(request.headers.get("authorization"))) {
      return jsonError("Bot không có quyền xem báo cáo.", 403);
    }

    const requestedDate = request.nextUrl.searchParams.get("date")?.trim() ?? "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : getHanoiDate();

    await connectMongo();

    const match = {
      depositDate: date,
      status: { $ne: canceledDepositStatus },
      $or: [
        { cardAction: depositCardAction },
        { ballAction: depositBallAction },
      ],
    };
    const [[totals], customers] = await Promise.all([
      CustomerDeposit.aggregate<DailyReportTotals>([
        { $match: match },
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            uniqueCustomers: { $addToSet: "$phone" },
            cardsDeposited: {
              $sum: { $cond: [{ $eq: ["$cardAction", depositCardAction] }, "$cards", 0] },
            },
            ballsDeposited: {
              $sum: { $cond: [{ $eq: ["$ballAction", depositBallAction] }, "$balls", 0] },
            },
          },
        },
      ]),
      CustomerDeposit.aggregate<CustomerDailyReport>([
        { $match: match },
        { $sort: { updatedAt: -1, createdAt: -1 } },
        {
          $group: {
            _id: "$phone",
            fullName: { $first: "$fullName" },
            cardsDeposited: {
              $sum: { $cond: [{ $eq: ["$cardAction", depositCardAction] }, "$cards", 0] },
            },
            ballsDeposited: {
              $sum: { $cond: [{ $eq: ["$ballAction", depositBallAction] }, "$balls", 0] },
            },
          },
        },
        { $sort: { cardsDeposited: -1, ballsDeposited: -1, fullName: 1 } },
      ]),
    ]);

    return NextResponse.json({
      date,
      totalRecords: totals?.totalRecords ?? 0,
      uniqueCustomers: totals?.uniqueCustomers.length ?? 0,
      cardsDeposited: totals?.cardsDeposited ?? 0,
      ballsDeposited: totals?.ballsDeposited ?? 0,
      customers: customers.map((customer) => ({
        fullName: customer.fullName,
        cardsDeposited: customer.cardsDeposited,
        ballsDeposited: customer.ballsDeposited,
      })),
    });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
