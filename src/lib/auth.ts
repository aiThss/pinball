import { cookies } from "next/headers";
import crypto from "crypto";

export function getAdminToken(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function verifyAdmin(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;
    const password = process.env.ADMIN_PASSWORD || "admin123";
    const expectedToken = getAdminToken(password);
    return token === expectedToken;
  } catch {
    return false;
  }
}
