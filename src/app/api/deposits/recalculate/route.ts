import { NextResponse } from "next/server";
import { jsonError, parseError } from "@/lib/api";
import { recalculateCustomerDepositTotals } from "@/lib/daily-deposits";
import { connectMongo } from "@/lib/mongodb";
import { CustomerDeposit } from "@/models/CustomerDeposit";

export async function POST() {
  try {
    await connectMongo();

    const phones = (await CustomerDeposit.distinct("phone")) as string[];
    await recalculateCustomerDepositTotals(phones);

    return NextResponse.json({
      ok: true,
      customersRecalculated: phones.length,
    });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
