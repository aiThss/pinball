import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { jsonError, parseError, serializeDeposit } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { buildTotalText } from "@/lib/time";
import { depositUpdateSchema } from "@/lib/validation";
import { CustomerDeposit, type ICustomerDeposit } from "@/models/CustomerDeposit";
import "@/models/User";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const staffAllowedFields = new Set(["cards", "balls", "status"]);

const labels: Record<string, string> = {
  fullName: "Họ tên",
  phone: "SĐT",
  depositDate: "Ngày gửi",
  depositTime: "Giờ gửi",
  cards: "Thẻ",
  balls: "Bi",
  status: "Trạng thái",
};

function formatChange(label: string, before: unknown, after: unknown) {
  return `${label}: ${before} -> ${after}`;
}

function applyChange<T extends keyof ICustomerDeposit>(
  deposit: ICustomerDeposit,
  field: T,
  value: ICustomerDeposit[T] | undefined,
  changes: string[],
) {
  if (value === undefined || deposit[field] === value) {
    return;
  }

  changes.push(formatChange(labels[String(field)] ?? String(field), deposit[field], value));
  deposit[field] = value;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return jsonError("Vui lòng đăng nhập.", 401);
  }

  try {
    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return jsonError("Bản ghi không hợp lệ.", 400);
    }

    const body = await request.json();
    const data = depositUpdateSchema.parse(body);
    const updatedFields = Object.keys(data);

    if (
      user.role !== "admin" &&
      updatedFields.some((field) => !staffAllowedFields.has(field))
    ) {
      return jsonError("Staff chỉ được cập nhật thẻ, bi và trạng thái.", 403);
    }

    await connectMongo();

    const deposit = await CustomerDeposit.findById(id);

    if (!deposit) {
      return jsonError("Không tìm thấy bản ghi.", 404);
    }

    const changes: string[] = [];

    if (user.role === "admin") {
      applyChange(deposit, "fullName", data.fullName, changes);
      applyChange(deposit, "phone", data.phone, changes);
      applyChange(deposit, "depositDate", data.depositDate, changes);
      applyChange(deposit, "depositTime", data.depositTime, changes);
    }

    applyChange(deposit, "cards", data.cards, changes);
    applyChange(deposit, "balls", data.balls, changes);
    applyChange(deposit, "status", data.status, changes);

    if (changes.length === 0) {
      await deposit.populate("createdBy updatedBy", "displayName username role");
      return NextResponse.json({ deposit: serializeDeposit(deposit) });
    }

    deposit.totalText = buildTotalText(deposit.cards, deposit.balls);
    deposit.updatedBy = new Types.ObjectId(user.id);
    deposit.history.push({
      at: new Date(),
      actorId: new Types.ObjectId(user.id),
      actorName: user.displayName,
      action: "UPDATE",
      content: changes.join("; "),
    });

    await deposit.save();
    await deposit.populate("createdBy updatedBy", "displayName username role");

    return NextResponse.json({ deposit: serializeDeposit(deposit) });
  } catch (error) {
    return jsonError(parseError(error), 400);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return jsonError("Vui lòng đăng nhập.", 401);
  }

  if (user.role !== "admin") {
    return jsonError("Chỉ admin được xóa bản ghi.", 403);
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

  return NextResponse.json({ ok: true });
}
