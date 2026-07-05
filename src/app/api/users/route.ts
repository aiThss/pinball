import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { jsonError, parseError, serializeUser } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { userCreateSchema } from "@/lib/validation";
import { User } from "@/models/User";

const MAX_ACTIVE_USERS = 10;

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return jsonError("Vui lòng đăng nhập.", 401);
  }

  if (currentUser.role !== "admin") {
    return jsonError("Chỉ admin được quản lý nhân viên.", 403);
  }

  await connectMongo();
  const users = await User.find().sort({ createdAt: -1 });

  return NextResponse.json({ users: users.map(serializeUser) });
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return jsonError("Vui lòng đăng nhập.", 401);
  }

  if (currentUser.role !== "admin") {
    return jsonError("Chỉ admin được tạo nhân viên.", 403);
  }

  try {
    const body = await request.json();
    const data = userCreateSchema.parse(body);

    await connectMongo();

    const activeUsers = await User.countDocuments({ isActive: true });

    if (activeUsers >= MAX_ACTIVE_USERS) {
      return jsonError("Đã đạt giới hạn 10 tài khoản hoạt động.", 400);
    }

    const existing = await User.findOne({ username: data.username });

    if (existing) {
      return jsonError("Tài khoản này đã tồn tại.", 409);
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await User.create({
      username: data.username,
      displayName: data.displayName,
      passwordHash,
      role: data.role,
      isActive: true,
    });

    return NextResponse.json({ user: serializeUser(user) }, { status: 201 });
  } catch (error) {
    return jsonError(parseError(error), 400);
  }
}
