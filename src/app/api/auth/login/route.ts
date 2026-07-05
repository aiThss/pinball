import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { jsonError, parseError, serializeUser } from "@/lib/api";
import { sessionCookieOptions, signSession, SESSION_COOKIE } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { loginSchema } from "@/lib/validation";
import { User } from "@/models/User";

async function bootstrapAdmin(username: string, password: string) {
  const userCount = await User.countDocuments();

  if (userCount > 0) {
    return null;
  }

  const adminUsername = process.env.ADMIN_USERNAME?.toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    return null;
  }

  if (username.toLowerCase() !== adminUsername || password !== adminPassword) {
    return null;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  return User.create({
    username: adminUsername,
    displayName: process.env.ADMIN_DISPLAY_NAME ?? "Admin",
    passwordHash,
    role: "admin",
    isActive: true,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const credentials = loginSchema.parse(body);

    await connectMongo();

    const bootstrappedUser = await bootstrapAdmin(
      credentials.username,
      credentials.password,
    );

    const user =
      bootstrappedUser ??
      (await User.findOne({ username: credentials.username.toLowerCase() }).select(
        "+passwordHash",
      ));

    if (!user || !user.isActive) {
      return jsonError("Tài khoản hoặc mật khẩu không đúng.", 401);
    }

    const passwordOk = await bcrypt.compare(credentials.password, user.passwordHash);

    if (!passwordOk) {
      return jsonError("Tài khoản hoặc mật khẩu không đúng.", 401);
    }

    const safeUser = serializeUser(user);
    const token = await signSession(safeUser);
    const response = NextResponse.json({ user: safeUser });

    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());

    return response;
  } catch (error) {
    return jsonError(parseError(error), 400);
  }
}
