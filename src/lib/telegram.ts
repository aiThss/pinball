import "server-only";
import crypto from "node:crypto";

export type TelegramMiniAppUser = {
  id: string;
  displayName: string;
  username?: string;
};

export type TelegramMiniAppAuthResult =
  | { ok: true; user: TelegramMiniAppUser }
  | { ok: false; status: number; message: string };

function safeCompare(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function getTelegramBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

function getTelegramAdminUserIds() {
  return new Set(
    String(process.env.TELEGRAM_ADMIN_USER_IDS || "")
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function verifyTelegramMiniAppInitData(
  initData: string | null,
  maxAgeSeconds = 6 * 60 * 60,
): TelegramMiniAppAuthResult {
  const botToken = getTelegramBotToken();
  const allowedUserIds = getTelegramAdminUserIds();

  if (!botToken || allowedUserIds.size === 0) {
    return {
      ok: false,
      status: 503,
      message: "Telegram Mini App chưa được cấu hình.",
    };
  }

  if (!initData) {
    return {
      ok: false,
      status: 401,
      message: "Hãy mở chức năng này từ nút trong Telegram.",
    };
  }

  try {
    const params = new URLSearchParams(initData);
    const providedHash = params.get("hash")?.trim() || "";

    if (!providedHash) {
      return { ok: false, status: 401, message: "Dữ liệu Telegram không hợp lệ." };
    }

    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();
    const expectedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (!safeCompare(providedHash, expectedHash)) {
      return { ok: false, status: 401, message: "Không xác thực được Telegram." };
    }

    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isFinite(authDate) ||
      authDate <= 0 ||
      authDate > now + 60 ||
      now - authDate > maxAgeSeconds
    ) {
      return {
        ok: false,
        status: 401,
        message: "Phiên Telegram đã hết hạn. Hãy đóng và mở lại Mini App.",
      };
    }

    const rawUser = params.get("user");
    const parsedUser = rawUser ? (JSON.parse(rawUser) as Record<string, unknown>) : null;
    const userId = parsedUser?.id !== undefined ? String(parsedUser.id) : "";

    if (!userId || !allowedUserIds.has(userId)) {
      return { ok: false, status: 403, message: "Bạn không có quyền quản trị." };
    }

    const firstName = typeof parsedUser?.first_name === "string" ? parsedUser.first_name.trim() : "";
    const lastName = typeof parsedUser?.last_name === "string" ? parsedUser.last_name.trim() : "";
    const username = typeof parsedUser?.username === "string" ? parsedUser.username.trim() : "";
    const displayName = [firstName, lastName].filter(Boolean).join(" ") || username || "Telegram Admin";

    return {
      ok: true,
      user: {
        id: userId,
        displayName,
        ...(username ? { username } : {}),
      },
    };
  } catch {
    return { ok: false, status: 401, message: "Dữ liệu Telegram không hợp lệ." };
  }
}

export function verifyTelegramBotBearer(authorizationHeader: string | null) {
  const botToken = getTelegramBotToken();
  const providedToken = authorizationHeader?.replace(/^Bearer\s+/i, "").trim() || "";

  if (!botToken || !providedToken) {
    return false;
  }

  return safeCompare(providedToken, botToken);
}
