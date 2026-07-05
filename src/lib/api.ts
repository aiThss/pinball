import { NextResponse } from "next/server";
import { ZodError } from "zod";

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

function serializeUserRef(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const user = value as {
    _id?: { toString: () => string };
    username?: string;
    displayName?: string;
    role?: string;
  };

  return {
    id: user._id?.toString() ?? "",
    username: user.username ?? "",
    displayName: user.displayName ?? "",
    role: user.role ?? "",
  };
}

export function serializeUser(user: {
  _id: { toString: () => string };
  username: string;
  displayName: string;
  role: "admin" | "staff";
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt?.toISOString(),
    updatedAt: user.updatedAt?.toISOString(),
  };
}

export function serializeDeposit(deposit: {
  toObject: () => Record<string, unknown>;
}) {
  const value = deposit.toObject();
  const history = Array.isArray(value.history) ? value.history : [];

  return {
    id: String(value._id),
    fullName: value.fullName,
    phone: value.phone,
    depositDate: value.depositDate,
    depositTime: value.depositTime,
    cards: value.cards,
    balls: value.balls,
    totalText: value.totalText,
    status: value.status,
    createdAt: value.createdAt instanceof Date ? value.createdAt.toISOString() : value.createdAt,
    updatedAt: value.updatedAt instanceof Date ? value.updatedAt.toISOString() : value.updatedAt,
    createdBy: serializeUserRef(value.createdBy),
    updatedBy: serializeUserRef(value.updatedBy),
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
