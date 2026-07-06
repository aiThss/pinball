import { NextRequest, NextResponse } from "next/server";
import { escapeRegex, jsonError, parseError } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { depositStatuses, normalizePhone } from "@/lib/validation";
import { CustomerDeposit } from "@/models/CustomerDeposit";

const minSuggestionDigits = 3;
const suggestionLimit = 6;

type PhoneSuggestion = {
  phone: string;
  fullName: string;
  activeDeposits: number;
  totalCards: number;
  totalBalls: number;
  latestStatus: string;
  latestDepositDate: string;
};

export async function GET(request: NextRequest) {
  try {
    const rawPhone = request.nextUrl.searchParams.get("phone") ?? "";
    const phone = normalizePhone(rawPhone);

    if (phone.length < minSuggestionDigits) {
      return NextResponse.json({
        found: false,
        phone,
        fullName: "",
        activeDeposits: 0,
        totalCards: 0,
        totalBalls: 0,
        suggestions: [],
      });
    }

    await connectMongo();

    const suggestions = await CustomerDeposit.aggregate<PhoneSuggestion>([
      { $match: { phone: { $regex: escapeRegex(phone), $options: "i" } } },
      { $sort: { updatedAt: -1, createdAt: -1 } },
      {
        $group: {
          _id: "$phone",
          phone: { $first: "$phone" },
          fullName: { $first: "$fullName" },
          activeDeposits: {
            $sum: { $cond: [{ $eq: ["$status", depositStatuses[0]] }, 1, 0] },
          },
          totalCards: {
            $sum: { $cond: [{ $eq: ["$status", depositStatuses[0]] }, "$cards", 0] },
          },
          totalBalls: {
            $sum: { $cond: [{ $eq: ["$status", depositStatuses[0]] }, "$balls", 0] },
          },
          latestStatus: { $first: "$status" },
          latestDepositDate: { $first: "$depositDate" },
        },
      },
      { $sort: { activeDeposits: -1, latestDepositDate: -1, fullName: 1 } },
      { $limit: suggestionLimit },
    ]);
    const match = suggestions.find((suggestion) => suggestion.phone === phone && suggestion.activeDeposits > 0);

    return NextResponse.json({
      found: Boolean(match),
      phone,
      fullName: match?.fullName ?? "",
      activeDeposits: match?.activeDeposits ?? 0,
      totalCards: match?.totalCards ?? 0,
      totalBalls: match?.totalBalls ?? 0,
      suggestions,
    });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
