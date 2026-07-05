import { NextResponse } from "next/server";
import { getHanoiNow, HANOI_TIMEZONE } from "@/lib/time";

export async function GET() {
  return NextResponse.json({
    ...getHanoiNow(),
    timezone: HANOI_TIMEZONE,
  });
}
