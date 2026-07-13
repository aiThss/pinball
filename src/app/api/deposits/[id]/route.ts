import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { jsonError, parseError, serializeDeposit } from "@/lib/api";
import { rebuildCustomerDailyTotalsForDates } from "@/lib/daily-deposits";
import { connectMongo } from "@/lib/mongodb";
import { buildTotalText } from "@/lib/time";
import { ballActions, cardActions, depositAdminUpdateSchema, depositStaffUpdateSchema } from "@/lib/validation";
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
const adminOnlyFields = ["depositDate", "depositTime"] as const;
const withdrawCardAction = cardActions[1];
const withdrawBallAction = ballActions[1];

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

function parseTotalText(value: string, fallbackCards: number, fallbackBalls: number) {
  const match = value.match(/:\s*(-?\d+)\s*\|\s*[^:|]+:\s*(-?\d+)/u);

  if (!match) {
    return {
      cards: fallbackCards,
      balls: fallbackBalls,
    };
  }

  return {
    cards: Number(match[1]),
    balls: Number(match[2]),
  };
}

function signedDelta(action: string, withdrawAction: string, before: number, after: number) {
  const delta = after - before;

  return action === withdrawAction ? -delta : delta;
}

function adjustSnapshotTotal(
  deposit: ICustomerDeposit,
  beforeCards: number,
  beforeBalls: number,
  beforeTotalText: string,
) {
  const previousTotal = parseTotalText(beforeTotalText, beforeCards, beforeBalls);

  deposit.totalText = buildTotalText(
    previousTotal.cards + signedDelta(deposit.cardAction, withdrawCardAction, beforeCards, deposit.cards),
    previousTotal.balls + signedDelta(deposit.ballAction, withdrawBallAction, beforeBalls, deposit.balls),
  );
}

function syncRemainingFields(
  deposit: ICustomerDeposit,
  beforeCards: number,
  beforeBalls: number,
  beforeRemainingCards: number | undefined,
  beforeRemainingBalls: number | undefined,
) {
  if (deposit.cardAction === withdrawCardAction) {
    deposit.remainingCards = 0;
  } else {
    const currentRemainingCards = beforeRemainingCards ?? beforeCards;
    deposit.remainingCards = Math.max(0, currentRemainingCards + deposit.cards - beforeCards);
  }

  if (deposit.ballAction === withdrawBallAction) {
    deposit.remainingBalls = 0;
  } else {
    const currentRemainingBalls = beforeRemainingBalls ?? beforeBalls;
    deposit.remainingBalls = Math.max(0, currentRemainingBalls + deposit.balls - beforeBalls);
  }
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
    const isAdminUpdate = isModifyingAdminFields && (await verifyAdmin());

    if (isModifyingAdminFields && !isAdminUpdate) {
      return jsonError("Bạn không có quyền chỉnh sửa các thông tin quản trị này.", 403);
    }

    await connectMongo();

    const deposit = await CustomerDeposit.findById(id);

    if (!deposit) {
      return jsonError("Không tìm thấy bản ghi.", 404);
    }

    const changes: string[] = [];
    let actorName = "";
    const beforeDepositDate = deposit.depositDate;
    const beforeCards = deposit.cards;
    const beforeBalls = deposit.balls;
    const beforeRemainingCards = deposit.remainingCards;
    const beforeRemainingBalls = deposit.remainingBalls;
    const beforeTotalText = deposit.totalText;

    if (isAdminUpdate) {
      const data = depositAdminUpdateSchema.parse(body);

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

      applyChange(deposit, "fullName", data.fullName, changes);
      applyChange(deposit, "phone", data.phone, changes);
      applyChange(deposit, "cards", data.cards, changes);
      applyChange(deposit, "balls", data.balls, changes);
      applyChange(deposit, "status", data.status, changes);
    }

    if (changes.length === 0) {
      return NextResponse.json({ deposit: serializeDeposit(deposit) });
    }

    syncRemainingFields(deposit, beforeCards, beforeBalls, beforeRemainingCards, beforeRemainingBalls);
    adjustSnapshotTotal(deposit, beforeCards, beforeBalls, beforeTotalText);

    if (isAdminUpdate) {
      // Admin corrections are intentionally silent: keep history, updatedByName and updatedAt unchanged.
      await deposit.save({ timestamps: false });
    } else {
      deposit.updatedByName = actorName;
      deposit.history.push({
        at: new Date(),
        actorName,
        action: "UPDATE",
        content: changes.join("; "),
      });
      await deposit.save();
    }

    await rebuildCustomerDailyTotalsForDates([beforeDepositDate, deposit.depositDate]);

    return NextResponse.json({ deposit: serializeDeposit(deposit) });
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

    await rebuildCustomerDailyTotalsForDates([deleted.depositDate]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
