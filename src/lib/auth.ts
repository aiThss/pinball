import { cookies } from "next/headers";
import crypto from "crypto";

export function getAdminToken(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function getAdminPassword() {
  const password = process.env.ADMIN_PASSWORD?.trim();

  if (password) {
    return password;
  }

  return null;
}

function safeCompare(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function getStaffAccessKey() {
  return process.env.STAFF_ACCESS_KEY?.trim() || process.env.STAFF_PIN?.trim() || "";
}

export async function verifyAdmin(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;
    const password = getAdminPassword();

    if (!token || !password) {
      return false;
    }

    const expectedToken = getAdminToken(password);
    return safeCompare(token, expectedToken);
  } catch {
    return false;
  }
}

export async function verifyStaffWrite(request: Request): Promise<boolean> {
  if (await verifyAdmin()) {
    return true;
  }

  const expectedKey = getStaffAccessKey();

  if (!expectedKey) {
    return process.env.NODE_ENV !== "production";
  }

  const providedKey =
    request.headers.get("x-staff-access-key")?.trim() ||
    request.headers.get("x-staff-pin")?.trim() ||
    "";

  if (!providedKey) {
    return false;
  }

  return safeCompare(providedKey, expectedKey);
}
