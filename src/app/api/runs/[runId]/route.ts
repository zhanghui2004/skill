import { after, NextResponse } from "next/server";
import { continuePipelineExecute } from "@/lib/pipeline";
import { loadRunRecord, toRunResponse } from "@/lib/runs";
import { requireViewer } from "@/lib/require-viewer";
import { redactText } from "@/lib/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function json(
  body: unknown,
  status = 200
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const viewer = await requireViewer(request);
    if (viewer instanceof Response) {
      const ctype = viewer.headers.get("content-type") || "";
      if (ctype.includes("application/json")) return viewer;
      const text = await viewer.text().catch(() => "");
      return json(
        {
          error: redactText(
            `未授权（HTTP ${viewer.status}）：${text.slice(0, 200) || "需要登录"}`
          ),
        },
        viewer.status === 401 || viewer.status === 403 ? viewer.status : 401
      );
    }

    const { runId } = await context.params;
    const record = await loadRunRecord(runId);
    if (!record) {
      return json({ error: "找不到运行记录" }, 404);
    }

    // Resume Step8 if create's after() was dropped by the host.
    if (record.status === "running") {
      const exec = record.steps.find((s) => s.id === "execute");
      const claimedAt = (exec?.data as { claimedAt?: string } | undefined)
        ?.claimedAt;
      if (exec?.status === "running" && !claimedAt) {
        try {
          after(() => continuePipelineExecute(runId));
        } catch {
          void continuePipelineExecute(runId);
        }
      }
    }

    return json({ run: toRunResponse(record) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: redactText(message) }, 500);
  }
}
