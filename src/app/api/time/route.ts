import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getHanoiNow, HANOI_TIMEZONE } from "@/lib/time";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return jsonError("Vui lòng đăng nhập.", 401);
  }

  return NextResponse.json({
    ...getHanoiNow(),
    timezone: HANOI_TIMEZONE,
  });
}
