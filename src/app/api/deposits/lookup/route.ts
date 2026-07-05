import { NextRequest, NextResponse } from "next/server";
import { jsonError, parseError } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { depositStatuses, normalizePhone, phoneSchema } from "@/lib/validation";
import { CustomerDeposit } from "@/models/CustomerDeposit";

export async function GET(request: NextRequest) {
  try {
    const rawPhone = request.nextUrl.searchParams.get("phone") ?? "";
    const parsedPhone = phoneSchema.safeParse(rawPhone);
    const phone = parsedPhone.success ? parsedPhone.data : normalizePhone(rawPhone);

    if (!parsedPhone.success) {
      return NextResponse.json({
        found: false,
        phone,
        fullName: "",
        activeDeposits: 0,
        totalCards: 0,
        totalBalls: 0,
      });
    }

    await connectMongo();

    const [match] = await CustomerDeposit.aggregate<{
      phone: string;
      fullName: string;
      activeDeposits: number;
      totalCards: number;
      totalBalls: number;
    }>([
      { $match: { phone, status: depositStatuses[0] } },
      { $sort: { updatedAt: -1, createdAt: -1 } },
      {
        $group: {
          _id: "$phone",
          phone: { $first: "$phone" },
          fullName: { $first: "$fullName" },
          activeDeposits: { $sum: 1 },
          totalCards: { $sum: "$cards" },
          totalBalls: { $sum: "$balls" },
        },
      },
    ]);

    return NextResponse.json({
      found: Boolean(match),
      phone,
      fullName: match?.fullName ?? "",
      activeDeposits: match?.activeDeposits ?? 0,
      totalCards: match?.totalCards ?? 0,
      totalBalls: match?.totalBalls ?? 0,
    });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
