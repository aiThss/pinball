import { NextResponse } from "next/server";
import { jsonError, parseError } from "@/lib/api";
import { verifyAdmin } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { ballActions, cardActions } from "@/lib/validation";
import { CustomerDeposit } from "@/models/CustomerDeposit";
import { CustomerDailyDeposit } from "@/models/CustomerDailyDeposit";

const depositCardAction = cardActions[0];
const withdrawCardAction = cardActions[1];
const depositBallAction = ballActions[0];
const withdrawBallAction = ballActions[1];

type AllTimeTotals = {
  _id: null;
  totalRecords: number;
  totalHistoryEntries: number;
  cardsDeposited: number;
  ballsDeposited: number;
  cardsWithdrawn: number;
  ballsWithdrawn: number;
  firstRecordAt?: Date;
  lastRecordAt?: Date;
};

// This is an authenticated, read-only diagnostic. It intentionally performs one
// bounded aggregate instead of generating concurrent traffic against production.
export async function GET() {
  try {
    if (!(await verifyAdmin())) {
      return jsonError("Unauthorized.", 403);
    }

    const startedAt = Date.now();
    await connectMongo();

    const [totals, dailySummaryRecords] = await Promise.all([
      CustomerDeposit.aggregate<AllTimeTotals>([
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            totalHistoryEntries: { $sum: { $size: { $ifNull: ["$history", []] } } },
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
            firstRecordAt: { $min: "$createdAt" },
            lastRecordAt: { $max: "$createdAt" },
          },
        },
      ]),
      CustomerDailyDeposit.countDocuments(),
    ]);

    const total = totals[0];

    return NextResponse.json(
      {
        checkedAt: new Date().toISOString(),
        databaseMs: Date.now() - startedAt,
        totalRecords: total?.totalRecords ?? 0,
        totalHistoryEntries: total?.totalHistoryEntries ?? 0,
        cardsDeposited: total?.cardsDeposited ?? 0,
        ballsDeposited: total?.ballsDeposited ?? 0,
        cardsWithdrawn: total?.cardsWithdrawn ?? 0,
        ballsWithdrawn: total?.ballsWithdrawn ?? 0,
        dailySummaryRecords,
        firstRecordAt: total?.firstRecordAt?.toISOString() ?? null,
        lastRecordAt: total?.lastRecordAt?.toISOString() ?? null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
