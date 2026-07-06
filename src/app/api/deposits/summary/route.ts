import { NextResponse } from "next/server";
import { jsonError, parseError } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { getHanoiNow } from "@/lib/time";
import { ballActions, cardActions, depositStatuses } from "@/lib/validation";
import { CustomerDeposit } from "@/models/CustomerDeposit";

const withdrawCardAction = cardActions[1];
const withdrawBallAction = ballActions[1];

export async function GET() {
  try {
    await connectMongo();
    const today = getHanoiNow().date;

    const [activeSummaries, todayDeposits, historySummaries] = await Promise.all([
      CustomerDeposit.aggregate<{
        activeDeposits: number;
        totalCards: number;
        totalBalls: number;
      }>([
        { $match: { status: depositStatuses[0] } },
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
    ]);
    const activeSummary = activeSummaries[0];
    const historySummary = historySummaries[0];

    return NextResponse.json({
      activeDeposits: activeSummary?.activeDeposits ?? 0,
      totalCards: activeSummary?.totalCards ?? 0,
      totalBalls: activeSummary?.totalBalls ?? 0,
      todayDeposits,
      historyEntries: historySummary?.historyEntries ?? 0,
    });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
