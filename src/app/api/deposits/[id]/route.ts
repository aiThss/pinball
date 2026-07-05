import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { jsonError, parseError, serializeDeposit } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { buildTotalText } from "@/lib/time";
import { depositUpdateSchema } from "@/lib/validation";
import { CustomerDeposit, type ICustomerDeposit } from "@/models/CustomerDeposit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
  try {
    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return jsonError("Bản ghi không hợp lệ.", 400);
    }

    const body = await request.json();
    const data = depositUpdateSchema.parse(body);

    await connectMongo();

    const deposit = await CustomerDeposit.findById(id);

    if (!deposit) {
      return jsonError("Không tìm thấy bản ghi.", 404);
    }

    const changes: string[] = [];

    applyChange(deposit, "fullName", data.fullName, changes);
    applyChange(deposit, "phone", data.phone, changes);
    applyChange(deposit, "depositDate", data.depositDate, changes);
    applyChange(deposit, "depositTime", data.depositTime, changes);
    applyChange(deposit, "cards", data.cards, changes);
    applyChange(deposit, "balls", data.balls, changes);
    applyChange(deposit, "status", data.status, changes);

    if (changes.length === 0) {
      return NextResponse.json({ deposit: serializeDeposit(deposit) });
    }

    deposit.totalText = buildTotalText(deposit.cards, deposit.balls);
    deposit.updatedByName = data.actorName;
    deposit.history.push({
      at: new Date(),
      actorName: data.actorName,
      action: "UPDATE",
      content: changes.join("; "),
    });

    await deposit.save();

    return NextResponse.json({ deposit: serializeDeposit(deposit) });
  } catch (error) {
    return jsonError(parseError(error), 400);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
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
