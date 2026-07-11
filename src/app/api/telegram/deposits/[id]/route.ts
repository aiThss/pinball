import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { jsonError, parseError, serializeDeposit } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { buildTotalText } from "@/lib/time";
import { verifyTelegramMiniAppInitData } from "@/lib/telegram";
import {
  ballActions,
  cardActions,
  depositAdminUpdateSchema,
  depositStatuses,
} from "@/lib/validation";
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
const activeDepositStatus = depositStatuses[0];
const withdrawCardAction = cardActions[1];
const withdrawBallAction = ballActions[1];

function authorizeTelegram(request: NextRequest) {
  return verifyTelegramMiniAppInitData(request.headers.get("x-telegram-init-data"));
}

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

function getHeldCards(deposit: ICustomerDeposit) {
  return deposit.cardAction === withdrawCardAction ? 0 : deposit.cards;
}

function getHeldBalls(deposit: ICustomerDeposit) {
  return deposit.ballAction === withdrawBallAction ? 0 : deposit.balls;
}

async function findDeposit(id: string) {
  if (!Types.ObjectId.isValid(id)) {
    return { error: jsonError("Bản ghi không hợp lệ.", 400) };
  }

  await connectMongo();
  const deposit = await CustomerDeposit.findById(id);

  if (!deposit) {
    return { error: jsonError("Không tìm thấy bản ghi.", 404) };
  }

  return { deposit };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = authorizeTelegram(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status);
    }

    const { id } = await context.params;
    const result = await findDeposit(id);

    if ("error" in result) {
      return result.error;
    }

    return NextResponse.json({ deposit: serializeDeposit(result.deposit) });
  } catch (error) {
    return jsonError(parseError(error), 500);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = authorizeTelegram(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status);
    }

    const { id } = await context.params;
    const result = await findDeposit(id);

    if ("error" in result) {
      return result.error;
    }

    const rawBody = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? (rawBody as Record<string, unknown>)
      : {};
    const data = depositAdminUpdateSchema.parse({
      ...body,
      actorName: auth.user.displayName,
    });
    const deposit = result.deposit;
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

    deposit.totalText = buildTotalText(getHeldCards(deposit), getHeldBalls(deposit));
    deposit.updatedByName = auth.user.displayName;
    deposit.history.push({
      at: new Date(),
      actorName: auth.user.displayName,
      action: "UPDATE",
      content: changes.join("; "),
    });

    await deposit.save();

    return NextResponse.json({
      deposit: serializeDeposit(deposit),
      active: deposit.status === activeDepositStatus,
    });
  } catch (error) {
    return jsonError(parseError(error), 400);
  }
}
