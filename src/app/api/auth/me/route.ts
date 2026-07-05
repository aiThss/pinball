import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth";

export async function GET() {
  const authorized = await verifyAdmin();
  return NextResponse.json({ authorized });
}
