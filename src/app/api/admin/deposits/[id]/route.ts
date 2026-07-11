import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { jsonError, parseError, serializeDeposit } from "@/lib/api";
import { verifyAdmin } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { CustomerDeposit } from "@/models/CustomerDeposit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    if (!(await verifyAdmin())) {
      return jsonError("Bạn không có quyền xem bản ghi này.", 403);
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return jsonError("Bản ghi không hợp lệ.", 400);
    }

    await connectMongo();
    const deposit = await CustomerDeposit.findById(id);

    if (!deposit) {
      return jsonError("Không tìm thấy bản ghi.", 404);
    }

    return NextResponse.json({ deposit: serializeDeposit(deposit) });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
