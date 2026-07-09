import { NextResponse } from "next/server";
import { isStaffAccessKeyConfigured } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({
    accessKeyRequired: isStaffAccessKeyConfigured(),
  });
}
