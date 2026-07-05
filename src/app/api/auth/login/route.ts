import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jsonError } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return jsonError("Vui lòng nhập mật khẩu.", 400);
    }

    const expectedPassword = process.env.ADMIN_PASSWORD || "admin123";

    if (password !== expectedPassword) {
      return jsonError("Mật khẩu không chính xác.", 401);
    }

    const token = getAdminToken(password);
    const cookieStore = await cookies();

    cookieStore.set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 1 day
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch {
    return jsonError("Có lỗi xảy ra khi đăng nhập.", 500);
  }
}
