import { NextResponse } from "next/server";
import { jsonError, parseError } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { getHanoiNow } from "@/lib/time";
import { ballActions, cardActions, depositStatuses } from "@/lib/validation";
import { CustomerDeposit } from "@/models/CustomerDeposit";

const withdrawCardAction = cardActions[1];
const withdrawBallAction = ballActions[1];
const activeDepositStatus = depositStatuses[0];

type CardRanking = {
  fullName: string;
  phone: string;
  totalCards: number;
};

export async function GET() {
  try {
    await connectMongo();
    const today = getHanoiNow().date;

    const [activeSummaries, todayDeposits, historySummaries, cardRankings] = await Promise.all([
      CustomerDeposit.aggregate<{
        activeDeposits: number;
        totalCards: number;
        totalBalls: number;
      }>([
        { $match: { status: activeDepositStatus } },
        {
          $group: {
            _id: null,
            activeDeposits: { $sum: 1 },
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
      ]),
      CustomerDeposit.countDocuments({ depositDate: today }),
      CustomerDeposit.aggregate<{ historyEntries: number }>([
        {
          $group: {
            _id: null,
            historyEntries: { $sum: { $size: { $ifNull: ["$history", []] } } },
          },
        },
      ]),
      CustomerDeposit.aggregate<CardRanking>([
        {
          $match: {
            status: activeDepositStatus,
            cardAction: { $ne: withdrawCardAction },
            cards: { $gt: 0 },
          },
        },
        { $sort: { updatedAt: -1, createdAt: -1 } },
        {
          $group: {
            _id: "$phone",
            fullName: { $first: "$fullName" },
            totalCards: { $sum: "$cards" },
            latestUpdatedAt: { $max: "$updatedAt" },
          },
        },
        { $match: { totalCards: { $gt: 0 } } },
        { $sort: { totalCards: -1, latestUpdatedAt: -1, fullName: 1 } },
        { $limit: 10 },
        {
          $project: {
            _id: 0,
            fullName: 1,
            phone: "$_id",
            totalCards: 1,
          },
        },
      ]),
    ]);
    const activeSummary = activeSummaries[0];
    const historySummary = historySummaries[0];

    return NextResponse.json({
      activeDeposits: activeSummary?.activeDeposits ?? 0,
      totalCards: activeSummary?.totalCards ?? 0,
      totalBalls: activeSummary?.totalBalls ?? 0,
      todayDeposits,
      historyEntries: historySummary?.historyEntries ?? 0,
      cardRankings,
    });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
