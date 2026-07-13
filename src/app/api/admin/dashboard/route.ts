import { NextRequest, NextResponse } from "next/server";
import { jsonError, parseError } from "@/lib/api";
import { verifyAdmin } from "@/lib/auth";
import { rebuildCustomerDailyTotalsForDates } from "@/lib/daily-deposits";
import { connectMongo } from "@/lib/mongodb";
import { getHanoiNow } from "@/lib/time";
import { ballActions, cardActions, depositStatuses } from "@/lib/validation";
import { CustomerDeposit } from "@/models/CustomerDeposit";
import { CustomerDailyDeposit } from "@/models/CustomerDailyDeposit";

const depositCardAction = cardActions[0];
const withdrawCardAction = cardActions[1];
const depositBallAction = ballActions[0];
const withdrawBallAction = ballActions[1];
const canceledDepositStatus = depositStatuses[3];
const adminDisplayName = process.env.ADMIN_DISPLAY_NAME || "Danh Thai";

type DateTotals = {
  _id: null;
  totalRecords: number;
  uniquePhones: string[];
  cardsDeposited: number;
  ballsDeposited: number;
  cardsWithdrawn: number;
  ballsWithdrawn: number;
};

type UpdatedRecord = {
  _id: string;
};

type RecentStaffUpdate = {
  _id: string;
  depositId: string;
  fullName: string;
  phone: string;
  updatedByName: string;
  updatedAt: Date;
  content: string;
};

type CustomerDailyTotal = {
  _id: string;
  fullName: string;
  phone: string;
  records: number;
  cardsDeposited: number;
  ballsDeposited: number;
  cardsWithdrawn: number;
  ballsWithdrawn: number;
};

function getHanoiDateBounds(date: string) {
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
}

export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdmin())) {
      return jsonError("Unauthorized.", 403);
    }

    await connectMongo();

    const requestedDate = request.nextUrl.searchParams.get("date")?.trim() || "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : getHanoiNow().date;
    const { start, end } = getHanoiDateBounds(date);

    await rebuildCustomerDailyTotalsForDates([date]);

    const [dateTotals, historyUpdatedRecords, updatedAtRecords, recentUpdates, customerDailyTotals] = await Promise.all([
      CustomerDeposit.aggregate<DateTotals>([
        { $match: { depositDate: date, status: { $ne: canceledDepositStatus } } },
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            uniquePhones: { $addToSet: "$phone" },
            cardsDeposited: {
              $sum: { $cond: [{ $eq: ["$cardAction", depositCardAction] }, "$cards", 0] },
            },
            ballsDeposited: {
              $sum: { $cond: [{ $eq: ["$ballAction", depositBallAction] }, "$balls", 0] },
            },
            cardsWithdrawn: {
              $sum: { $cond: [{ $eq: ["$cardAction", withdrawCardAction] }, "$cards", 0] },
            },
            ballsWithdrawn: {
              $sum: { $cond: [{ $eq: ["$ballAction", withdrawBallAction] }, "$balls", 0] },
            },
          },
        },
      ]),
      CustomerDeposit.aggregate<UpdatedRecord>([
        { $unwind: "$history" },
        {
          $match: {
            "history.action": "UPDATE",
            "history.at": { $gte: start, $lt: end },
          },
        },
        { $group: { _id: "$_id" } },
      ]),
      CustomerDeposit.aggregate<UpdatedRecord>([
        {
          $match: {
            updatedAt: { $gte: start, $lt: end },
            $expr: { $ne: ["$updatedAt", "$createdAt"] },
          },
        },
        { $group: { _id: "$_id" } },
      ]),
      CustomerDeposit.aggregate<RecentStaffUpdate>([
        { $unwind: "$history" },
        {
          $match: {
            "history.action": "UPDATE",
            "history.actorName": { $ne: adminDisplayName },
          },
        },
        { $sort: { "history.at": -1 } },
        { $limit: 100 },
        {
          $project: {
            _id: { $toString: "$history._id" },
            depositId: { $toString: "$_id" },
            fullName: 1,
            phone: 1,
            updatedByName: "$history.actorName",
            updatedAt: "$history.at",
            content: "$history.content",
          },
        },
      ]),
      CustomerDailyDeposit.aggregate<CustomerDailyTotal>([
        { $match: { date } },
        { $sort: { cardsDeposited: -1, ballsDeposited: -1, records: -1, fullName: 1 } },
        { $limit: 100 },
        {
          $project: {
            _id: { $toString: "$_id" },
            fullName: 1,
            phone: 1,
            records: 1,
            cardsDeposited: 1,
            ballsDeposited: 1,
            cardsWithdrawn: 1,
            ballsWithdrawn: 1,
          },
        },
      ]),
    ]);

    const totals = dateTotals[0];
    const updatedRecordIds = new Set([
      ...historyUpdatedRecords.map((record) => String(record._id)),
      ...updatedAtRecords.map((record) => String(record._id)),
    ]);

    return NextResponse.json({
      date,
      dateSummary: {
        totalRecords: totals?.totalRecords ?? 0,
        uniqueCustomers: totals?.uniquePhones?.length ?? 0,
        cardsDeposited: totals?.cardsDeposited ?? 0,
        ballsDeposited: totals?.ballsDeposited ?? 0,
        cardsWithdrawn: totals?.cardsWithdrawn ?? 0,
        ballsWithdrawn: totals?.ballsWithdrawn ?? 0,
        recordsUpdated: updatedRecordIds.size,
      },
      recentUpdates: recentUpdates.map((update) => ({
        id: update._id,
        depositId: update.depositId,
        fullName: update.fullName,
        phone: update.phone,
        updatedByName: update.updatedByName,
        updatedAt: update.updatedAt.toISOString(),
        content: update.content,
      })),
      customerDailyTotals: customerDailyTotals.map((total) => ({
        id: total._id,
        fullName: total.fullName,
        phone: total.phone,
        records: total.records,
        cardsDeposited: total.cardsDeposited,
        ballsDeposited: total.ballsDeposited,
        cardsWithdrawn: total.cardsWithdrawn,
        ballsWithdrawn: total.ballsWithdrawn,
      })),
    });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
