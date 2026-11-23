import { NextResponse } from "next/server";
import { listProviderStatuses } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ providers: listProviderStatuses() });
}
