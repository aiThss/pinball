import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { jsonError, parseError } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { verifyTelegramBotBearer } from "@/lib/telegram";
import { CustomerDeposit } from "@/models/CustomerDeposit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    if (!verifyTelegramBotBearer(request.headers.get("authorization"))) {
      return jsonError("Bot không có quyền xoá bản ghi.", 403);
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return jsonError("Bản ghi không hợp lệ.", 400);
    }

    await connectMongo();
    const deleted = await CustomerDeposit.findByIdAndDelete(id);

    if (!deleted) {
      return jsonError("Không tìm thấy bản ghi.", 404);
    }

    return NextResponse.json({
      ok: true,
      id,
      fullName: deleted.fullName,
    });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
