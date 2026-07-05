import { NextResponse } from "next/server";
import { jsonError, parseError } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { depositStatuses } from "@/lib/validation";
import { CustomerDeposit } from "@/models/CustomerDeposit";

export async function GET() {
  try {
    await connectMongo();

    const [summary] = await CustomerDeposit.aggregate<{
      activeDeposits: number;
      totalCards: number;
      totalBalls: number;
    }>([
      { $match: { status: depositStatuses[0] } },
      {
        $group: {
          _id: null,
          activeDeposits: { $sum: 1 },
          totalCards: { $sum: "$cards" },
          totalBalls: { $sum: "$balls" },
        },
      },
    ]);

    return NextResponse.json({
      activeDeposits: summary?.activeDeposits ?? 0,
      totalCards: summary?.totalCards ?? 0,
      totalBalls: summary?.totalBalls ?? 0,
    });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
