import { NextRequest, NextResponse } from "next/server";
import { escapeRegex, jsonError, parseError } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { ballActions, cardActions, depositStatuses, normalizePhone } from "@/lib/validation";
import { CustomerDeposit } from "@/models/CustomerDeposit";

const minSuggestionDigits = 3;
const minSuggestionTextLength = 2;
const suggestionLimit = 6;
const withdrawCardAction = cardActions[1];
const withdrawBallAction = ballActions[1];

type PhoneSuggestion = {
  phone: string;
  fullName: string;
  activeDeposits: number;
  totalCards: number;
  totalBalls: number;
  latestStatus: string;
  latestDepositDate: string;
};

function buildQueryFilter(phone: string, rawQ: string) {
  // Generic q param: may contain digits (phone match), text (name match), or both
  if (rawQ) {
    const digits = rawQ.replace(/\D/g, "");
    const hasDigits = digits.length >= minSuggestionDigits;
    const hasText = rawQ.replace(/\d/g, "").trim().length >= minSuggestionTextLength;

    if (hasDigits && hasText) {
      return {
        $or: [
          { phone: { $regex: escapeRegex(digits), $options: "i" } },
          { fullName: { $regex: escapeRegex(rawQ.trim()), $options: "i" } },
        ],
      };
    }

    if (hasDigits) {
      return { phone: { $regex: escapeRegex(digits), $options: "i" } };
    }

    if (hasText) {
      return { fullName: { $regex: escapeRegex(rawQ.trim()), $options: "i" } };
    }

    // q too short — return no-match sentinel
    return null;
  }

  // Legacy phone param
  if (phone.length >= minSuggestionDigits) {
    return { phone: { $regex: escapeRegex(phone), $options: "i" } };
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const rawPhone = request.nextUrl.searchParams.get("phone") ?? "";
    const rawQ = request.nextUrl.searchParams.get("q") ?? "";
    const phone = normalizePhone(rawPhone);

    const filter = buildQueryFilter(phone, rawQ);

    if (!filter) {
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
      { $match: filter },
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
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", depositStatuses[0]] },
                    { $ne: ["$cardAction", withdrawCardAction] },
                  ],
                },
                "$cards",
                0,
              ],
            },
          },
          totalBalls: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", depositStatuses[0]] },
                    { $ne: ["$ballAction", withdrawBallAction] },
                  ],
                },
                "$balls",
                0,
              ],
            },
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
