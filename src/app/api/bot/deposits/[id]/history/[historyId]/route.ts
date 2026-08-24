import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { jsonError, parseError } from "@/lib/api";
import { rebuildCustomerDailyTotalsForDates } from "@/lib/daily-deposits";
import { connectMongo } from "@/lib/mongodb";
import { verifyTelegramBotBearer } from "@/lib/telegram";
import { CustomerDeposit, type ICustomerDeposit, type IHistorySnapshot } from "@/models/CustomerDeposit";

type RouteContext = {
  params: Promise<{ id: string; historyId: string }>;
};

function matchesSnapshot(deposit: ICustomerDeposit, snapshot: IHistorySnapshot) {
  return (
    deposit.fullName === snapshot.fullName &&
    deposit.phone === snapshot.phone &&
    deposit.depositDate === snapshot.depositDate &&
    deposit.depositTime === snapshot.depositTime &&
    deposit.cardAction === snapshot.cardAction &&
    deposit.ballAction === snapshot.ballAction &&
    deposit.cards === snapshot.cards &&
    deposit.balls === snapshot.balls &&
    (deposit.remainingCards ?? null) === (snapshot.remainingCards ?? null) &&
    (deposit.remainingBalls ?? null) === (snapshot.remainingBalls ?? null) &&
    deposit.totalText === snapshot.totalText &&
    deposit.status === snapshot.status
  );
}

function restoreSnapshot(deposit: ICustomerDeposit, snapshot: IHistorySnapshot) {
  deposit.fullName = snapshot.fullName;
  deposit.phone = snapshot.phone;
  deposit.depositDate = snapshot.depositDate;
  deposit.depositTime = snapshot.depositTime;
  deposit.cardAction = snapshot.cardAction;
  deposit.ballAction = snapshot.ballAction;
  deposit.cards = snapshot.cards;
  deposit.balls = snapshot.balls;
  deposit.remainingCards = snapshot.remainingCards;
  deposit.remainingBalls = snapshot.remainingBalls;
  deposit.totalText = snapshot.totalText;
  deposit.status = snapshot.status;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    if (!verifyTelegramBotBearer(request.headers.get("authorization"))) {
      return jsonError("Bot không có quyền xoá thay đổi.", 403);
    }

    const { id, historyId } = await context.params;

    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(historyId)) {
      return jsonError("ID bản ghi hoặc thay đổi không hợp lệ.", 400);
    }

    await connectMongo();
    const deposit = await CustomerDeposit.findById(id);

    if (!deposit) {
      return jsonError("Không tìm thấy bản ghi.", 404);
    }

    const historyIndex = deposit.history.findIndex(
      (entry) => String(entry._id ?? "") === historyId,
    );
    const historyEntry = historyIndex >= 0 ? deposit.history[historyIndex] : null;

    if (!historyEntry || historyEntry.action !== "UPDATE") {
      return jsonError("Không tìm thấy thay đổi cần xoá.", 404);
    }

    if (historyIndex !== deposit.history.length - 1) {
      return jsonError("Chỉ có thể xoá thay đổi gần nhất của bản ghi.", 409);
    }

    if (!historyEntry.before || !historyEntry.after) {
      return jsonError("Thay đổi này chưa có dữ liệu để hoàn tác.", 409);
    }

    if (!matchesSnapshot(deposit, historyEntry.after)) {
      return jsonError("Bản ghi đã thay đổi sau thông báo này, không thể tự động hoàn tác.", 409);
    }

    const currentDepositDate = deposit.depositDate;
    const previousUpdate = deposit.history
      .slice(0, historyIndex)
      .reverse()
      .find((entry) => entry.action === "UPDATE");

    restoreSnapshot(deposit, historyEntry.before);
    deposit.updatedByName = previousUpdate?.actorName ?? deposit.createdByName;
    deposit.history.splice(historyIndex, 1);

    await deposit.save();
    await rebuildCustomerDailyTotalsForDates([currentDepositDate, deposit.depositDate]);

    return NextResponse.json({
      ok: true,
      id,
      historyId,
      fullName: deposit.fullName,
      actorName: historyEntry.actorName,
      content: historyEntry.content,
    });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}
