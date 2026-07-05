import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { connectMongo } from "@/lib/mongodb";
import { serializeUser } from "@/lib/api";
import { User } from "@/models/User";

export const SESSION_COOKIE = "pinball_session";
const SESSION_MAX_AGE = 60 * 60 * 12;

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "staff";
  isActive: boolean;
};

function getSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("Missing AUTH_SECRET or JWT_SECRET environment variable.");
  }

  return new TextEncoder().encode(secret);
}

export async function signSession(user: AuthUser) {
  return new SignJWT({
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySession(token: string) {
  const { payload } = await jwtVerify(token, getSecret());

  if (!payload.sub) {
    return null;
  }

  return payload;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const payload = await verifySession(token);

    if (!payload?.sub) {
      return null;
    }

    await connectMongo();
    const user = await User.findById(payload.sub);

    if (!user || !user.isActive) {
      return null;
    }

    return serializeUser(user) as AuthUser;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}
