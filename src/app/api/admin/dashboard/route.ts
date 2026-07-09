import { NextRequest, NextResponse } from "next/server";
import { jsonError, parseError } from "@/lib/api";
import { verifyAdmin } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { getHanoiNow } from "@/lib/time";
import { ballActions, cardActions } from "@/lib/validation";
import { CustomerDeposit } from "@/models/CustomerDeposit";

const depositCardAction = cardActions[0];
const withdrawCardAction = cardActions[1];
const depositBallAction = ballActions[0];
const withdrawBallAction = ballActions[1];
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

    const [dateTotals, historyUpdatedRecords, updatedAtRecords, recentUpdates] = await Promise.all([
      CustomerDeposit.aggregate<DateTotals>([
        { $match: { depositDate: date } },
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
    });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
