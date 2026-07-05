import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jsonError } from "@/lib/api";

export async function POST() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("admin_token");
    return NextResponse.json({ success: true });
  } catch {
    return jsonError("Có lỗi xảy ra khi đăng xuất.", 500);
  }
}
