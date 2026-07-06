import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ballActions, cardActions } from "@/lib/validation";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

export function parseError(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Có lỗi xảy ra.";
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function serializeDeposit(deposit: {
  toObject: () => Record<string, unknown>;
}, overrides: Partial<{ totalText: string }> = {}) {
  const value = deposit.toObject();
  const history = Array.isArray(value.history) ? value.history : [];

  return {
    id: String(value._id),
    fullName: value.fullName,
    phone: value.phone,
    depositDate: value.depositDate,
    depositTime: value.depositTime,
    cardAction: value.cardAction ?? cardActions[0],
    ballAction: value.ballAction ?? ballActions[0],
    cards: value.cards,
    balls: value.balls,
    totalText: overrides.totalText ?? value.totalText,
    status: value.status,
    createdByName: value.createdByName,
    updatedByName: value.updatedByName,
    createdAt: value.createdAt instanceof Date ? value.createdAt.toISOString() : value.createdAt,
    updatedAt: value.updatedAt instanceof Date ? value.updatedAt.toISOString() : value.updatedAt,
    createdBy: null,
    updatedBy: null,
    history: history.map((item) => {
      const entry = item as Record<string, unknown>;

      return {
        id: String(entry._id ?? ""),
        at: entry.at instanceof Date ? entry.at.toISOString() : entry.at,
        actorId: String(entry.actorId ?? ""),
        actorName: entry.actorName,
        action: entry.action,
        content: entry.content,
      };
    }),
  };
}
