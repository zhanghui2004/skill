import { NextResponse } from "next/server";
import { loadRunRecord } from "@/lib/runs";
import { requireViewer } from "@/lib/require-viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;

  const { runId } = await context.params;
  const record = await loadRunRecord(runId);
  if (!record) {
    return NextResponse.json({ error: "找不到运行记录" }, { status: 404 });
  }
  return NextResponse.json(
    { run: record },
    { headers: { "cache-control": "private, no-store" } }
  );
}
