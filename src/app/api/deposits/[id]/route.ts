import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { jsonError, parseError, serializeDeposit } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { buildTotalText } from "@/lib/time";
import { depositAdminUpdateSchema, depositStaffUpdateSchema, depositStatuses } from "@/lib/validation";
import { CustomerDeposit, type ICustomerDeposit } from "@/models/CustomerDeposit";
import { verifyAdmin } from "@/lib/auth";

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
const adminOnlyFields = ["fullName", "phone", "depositDate", "depositTime"] as const;
const activeDepositStatus = depositStatuses[0];

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

async function serializeWithActiveTotal(deposit: ICustomerDeposit) {
  if (deposit.status !== activeDepositStatus) {
    return serializeDeposit(deposit);
  }

  const [activeTotal] = await CustomerDeposit.aggregate<{
    totalCards: number;
    totalBalls: number;
  }>([
    { $match: { phone: deposit.phone, status: activeDepositStatus } },
    {
      $group: {
        _id: null,
        totalCards: { $sum: "$cards" },
        totalBalls: { $sum: "$balls" },
      },
    },
  ]);

  return serializeDeposit(deposit, {
    totalText: buildTotalText(activeTotal?.totalCards ?? deposit.cards, activeTotal?.totalBalls ?? deposit.balls),
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return jsonError("Bản ghi không hợp lệ.", 400);
    }

    const body = await request.json();
    const rawData =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};

    const isModifyingAdminFields = adminOnlyFields.some((field) =>
      Object.prototype.hasOwnProperty.call(rawData, field),
    );

    if (isModifyingAdminFields) {
      const isApproved = await verifyAdmin();
      if (!isApproved) {
        return jsonError("Bạn không có quyền chỉnh sửa các thông tin quản trị này.", 403);
      }
    }

    await connectMongo();

    const deposit = await CustomerDeposit.findById(id);

    if (!deposit) {
      return jsonError("Không tìm thấy bản ghi.", 404);
    }

    const changes: string[] = [];
    let actorName = "";

    if (isModifyingAdminFields) {
      const data = depositAdminUpdateSchema.parse(body);
      actorName = data.actorName;

      applyChange(deposit, "fullName", data.fullName, changes);
      applyChange(deposit, "phone", data.phone, changes);
      applyChange(deposit, "depositDate", data.depositDate, changes);
      applyChange(deposit, "depositTime", data.depositTime, changes);
      applyChange(deposit, "cards", data.cards, changes);
      applyChange(deposit, "balls", data.balls, changes);
      applyChange(deposit, "status", data.status, changes);
    } else {
      const data = depositStaffUpdateSchema.parse(body);
      actorName = data.actorName;

      applyChange(deposit, "cards", data.cards, changes);
      applyChange(deposit, "balls", data.balls, changes);
      applyChange(deposit, "status", data.status, changes);
    }

    if (changes.length === 0) {
      return NextResponse.json({ deposit: await serializeWithActiveTotal(deposit) });
    }

    deposit.totalText = buildTotalText(deposit.cards, deposit.balls);
    deposit.updatedByName = actorName;
    deposit.history.push({
      at: new Date(),
      actorName,
      action: "UPDATE",
      content: changes.join("; "),
    });

    await deposit.save();

    return NextResponse.json({ deposit: await serializeWithActiveTotal(deposit) });
  } catch (error) {
    return jsonError(parseError(error), 400);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const isApproved = await verifyAdmin();
    if (!isApproved) {
      return jsonError("Bạn không có quyền xóa bản ghi.", 403);
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
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
