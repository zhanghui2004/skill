import { NextResponse } from "next/server";
import { loadRunRecord } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const { runId } = await context.params;
  const record = await loadRunRecord(runId);
  if (!record) {
    return NextResponse.json({ error: "找不到运行记录" }, { status: 404 });
  }
  return NextResponse.json({ run: record });
}
