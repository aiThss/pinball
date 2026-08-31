import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { jsonError, parseError, serializeDeposit } from "@/lib/api";
import { recalculateCustomerDepositTotals, rebuildCustomerDailyTotalsForDates } from "@/lib/daily-deposits";
import { connectMongo } from "@/lib/mongodb";
import { buildTotalText } from "@/lib/time";
import { restoreDeletedWithdrawal } from "@/lib/withdrawal-recovery";
import { ballActions, cardActions, depositAdminUpdateSchema, depositStaffUpdateSchema } from "@/lib/validation";
import { CustomerDeposit, type ICustomerDeposit, type IHistorySnapshot } from "@/models/CustomerDeposit";
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

function snapshotDeposit(deposit: ICustomerDeposit): IHistorySnapshot {
  return {
    fullName: deposit.fullName,
    phone: deposit.phone,
    depositDate: deposit.depositDate,
    depositTime: deposit.depositTime,
    cardAction: deposit.cardAction,
    ballAction: deposit.ballAction,
    cards: deposit.cards,
    balls: deposit.balls,
    ...(deposit.remainingCards === undefined ? {} : { remainingCards: deposit.remainingCards }),
    ...(deposit.remainingBalls === undefined ? {} : { remainingBalls: deposit.remainingBalls }),
    totalText: deposit.totalText,
    status: deposit.status,
  };
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
    const beforePhone = deposit.phone;
    const beforeDepositDate = deposit.depositDate;
    const beforeCards = deposit.cards;
    const beforeBalls = deposit.balls;
    const beforeRemainingCards = deposit.remainingCards;
    const beforeRemainingBalls = deposit.remainingBalls;
    const beforeTotalText = deposit.totalText;
    const beforeSnapshot = snapshotDeposit(deposit);

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
      const updateHistoryId = new Types.ObjectId();
      const updateContent = changes.join("; ");
      const updateHistory = {
        _id: updateHistoryId,
        at: new Date(),
        actorName,
        action: "UPDATE" as const,
        content: updateContent,
        before: beforeSnapshot,
        after: snapshotDeposit(deposit),
      };

      deposit.updatedByName = actorName;
      deposit.history.push(updateHistory);
      await deposit.save();

      const webhookUrl =
        process.env.TELEGRAM_BOT_WEBHOOK_URL ||
        process.env.PINBALL_BOT_WEBHOOK_URL ||
        process.env.BOT_WEBHOOK_URL;
      if (webhookUrl) {
        void fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "UPDATE",
            id: deposit._id.toString(),
            historyId: updateHistoryId.toString(),
            title: deposit.fullName + " (" + deposit.phone + ")",
            type: "Cập nhật (Bởi " + actorName + " lúc " + deposit.depositTime + ")",
            fullName: deposit.fullName,
            phone: deposit.phone,
            actorName,
            depositTime: deposit.depositTime,
            depositDate: deposit.depositDate,
            content: updateContent,
            totalText: deposit.totalText,
          }),
        }).catch((error) => {
          console.error("Lỗi gửi webhook cập nhật tới Telegram Bot:", error.message);
        });
      }
    }

    await recalculateCustomerDepositTotals([beforePhone, deposit.phone]);
    await rebuildCustomerDailyTotalsForDates([beforeDepositDate, deposit.depositDate]);

    const refreshed = await CustomerDeposit.findById(deposit._id);

    return NextResponse.json({ deposit: serializeDeposit(refreshed ?? deposit) });
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
    const deleted = await CustomerDeposit.findById(id);

    if (!deleted) {
      return jsonError("Không tìm thấy bản ghi.", 404);
    }

    const restored = await restoreDeletedWithdrawal(deleted);
    await CustomerDeposit.deleteOne({ _id: deleted._id });

    await recalculateCustomerDepositTotals([deleted.phone]);
    await rebuildCustomerDailyTotalsForDates([deleted.depositDate]);

    return NextResponse.json({
      ok: true,
      restoredCards: restored.cards,
      restoredBalls: restored.balls,
    });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
