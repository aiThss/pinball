import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { jsonError, parseError, serializeUser } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { userUpdateSchema } from "@/lib/validation";
import { User } from "@/models/User";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function isLastActiveAdmin(userId: string) {
  const activeAdmins = await User.countDocuments({
    role: "admin",
    isActive: true,
    _id: { $ne: userId },
  });

  return activeAdmins === 0;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return jsonError("Vui lòng đăng nhập.", 401);
  }

  if (currentUser.role !== "admin") {
    return jsonError("Chỉ admin được sửa nhân viên.", 403);
  }

  try {
    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return jsonError("Nhân viên không hợp lệ.", 400);
    }

    const body = await request.json();
    const data = userUpdateSchema.parse(body);

    await connectMongo();
    const user = await User.findById(id);

    if (!user) {
      return jsonError("Không tìm thấy nhân viên.", 404);
    }

    const demotesAdmin = user.role === "admin" && data.role === "staff";
    const deactivatesAdmin = user.role === "admin" && data.isActive === false;

    if ((demotesAdmin || deactivatesAdmin) && (await isLastActiveAdmin(id))) {
      return jsonError("Cần giữ lại ít nhất một admin hoạt động.", 400);
    }

    if (data.displayName !== undefined) {
      user.displayName = data.displayName;
    }

    if (data.role !== undefined) {
      user.role = data.role;
    }

    if (data.isActive !== undefined) {
      user.isActive = data.isActive;
    }

    if (data.password) {
      user.passwordHash = await bcrypt.hash(data.password, 12);
    }

    await user.save();

    return NextResponse.json({ user: serializeUser(user) });
  } catch (error) {
    return jsonError(parseError(error), 400);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return jsonError("Vui lòng đăng nhập.", 401);
  }

  if (currentUser.role !== "admin") {
    return jsonError("Chỉ admin được xóa nhân viên.", 403);
  }

  const { id } = await context.params;

  if (!Types.ObjectId.isValid(id)) {
    return jsonError("Nhân viên không hợp lệ.", 400);
  }

  if (id === currentUser.id) {
    return jsonError("Không thể xóa chính tài khoản đang đăng nhập.", 400);
  }

  await connectMongo();
  const user = await User.findById(id);

  if (!user) {
    return jsonError("Không tìm thấy nhân viên.", 404);
  }

  if (user.role === "admin" && (await isLastActiveAdmin(id))) {
    return jsonError("Cần giữ lại ít nhất một admin hoạt động.", 400);
  }

  await user.deleteOne();

  return NextResponse.json({ ok: true });
}
