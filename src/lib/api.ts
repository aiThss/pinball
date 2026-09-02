import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { buildTotalText } from "@/lib/time";
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

function normalizeTotalText(value: unknown, cards: unknown, balls: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  const match = text.match(/:\s*(-?\d+)\s*\|\s*[^:|]+:\s*(-?\d+)/u);

  if (match) {
    return buildTotalText(Number(match[1]), Number(match[2]));
  }

  return buildTotalText(Number(cards) || 0, Number(balls) || 0);
}

function toPlainObject(deposit: unknown) {
  if (deposit && typeof deposit === "object" && "toObject" in deposit) {
    const toObject = (deposit as { toObject?: unknown }).toObject;

    if (typeof toObject === "function") {
      return toObject.call(deposit) as Record<string, unknown>;
    }
  }

  return (deposit ?? {}) as Record<string, unknown>;
}

function serializeHistoryEntry(item: unknown) {
  const entry = item as Record<string, unknown>;

  return {
    id: String(entry._id ?? entry.id ?? ""),
    at: entry.at instanceof Date ? entry.at.toISOString() : entry.at,
    actorId: String(entry.actorId ?? ""),
    actorName: entry.actorName,
    action: entry.action,
    content: entry.content,
  };
}

export function serializeDeposit(deposit: unknown, overrides: Partial<{ totalText: string }> = {}) {
  const value = toPlainObject(deposit);
  const history = Array.isArray(value.history) ? value.history : [];
  const latestUpdate =
    value.latestUpdate ??
    [...history].reverse().find((item) => (item as Record<string, unknown>).action === "UPDATE");
  const snapshotTotalText = normalizeTotalText(value.totalText, value.cards, value.balls);

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
    // The raw value is retained as an audit snapshot. API callers may replace
    // `totalText` with the live held balance without losing that history.
    totalText: overrides.totalText ?? snapshotTotalText,
    snapshotTotalText,
    status: value.status,
    createdByName: value.createdByName,
    updatedByName: value.updatedByName,
    createdAt: value.createdAt instanceof Date ? value.createdAt.toISOString() : value.createdAt,
    updatedAt: value.updatedAt instanceof Date ? value.updatedAt.toISOString() : value.updatedAt,
    createdBy: null,
    updatedBy: null,
    latestUpdate: latestUpdate ? serializeHistoryEntry(latestUpdate) : null,
    history: history.map(serializeHistoryEntry),
  };
}
