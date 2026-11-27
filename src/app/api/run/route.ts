import { after, NextResponse } from "next/server";
import {
  continuePipelineExecute,
  runPipeline,
} from "@/lib/pipeline";
import { requireViewer } from "@/lib/require-viewer";
import { redactText } from "@/lib/redact";
import type { RunMode, RunProvider, RunResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Covers async Step8 via after(); the HTTP response itself returns after steps 1–7. */
export const maxDuration = 300;

function failedJson(
  error: string,
  status = 500,
  extra?: Partial<RunResponse>
): NextResponse {
  const body: RunResponse = {
    runId: extra?.runId ?? "error",
    status: "failed",
    steps: extra?.steps ?? [],
    finalAnswer: extra?.finalAnswer ?? null,
    selectedSkill: extra?.selectedSkill ?? null,
    provider: extra?.provider ?? "cursor",
    toolEvents: extra?.toolEvents ?? [],
    explanation: extra?.explanation,
    error: redactText(error),
  };
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function POST(request: Request) {
  try {
    const viewer = await requireViewer(request);
    if (viewer instanceof Response) {
      const ctype = viewer.headers.get("content-type") || "";
      if (ctype.includes("application/json")) return viewer;
      const text = await viewer.text().catch(() => "");
      return failedJson(
        `未授权（HTTP ${viewer.status}）：${text.slice(0, 200) || "需要登录"}`,
        viewer.status === 401 || viewer.status === 403 ? viewer.status : 401
      );
    }

    let body: {
      prompt?: string;
      mode?: RunMode;
      provider?: RunProvider;
      skillName?: string;
      model?: string;
      autoMatch?: boolean;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return failedJson("请求体必须是 JSON", 400);
    }

    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const autoMatch = body.autoMatch !== false && body.mode !== "manual";
    const mode: RunMode = autoMatch ? "auto" : "manual";
    const provider = body.provider;
    const skillName =
      typeof body.skillName === "string" ? body.skillName : undefined;

    // Steps 1–7 sync → JSON quickly; Step8 continues after the response.
    let result;
    try {
      result = await runPipeline({
        prompt,
        mode,
        provider,
        skillName,
        model: typeof body.model === "string" ? body.model : undefined,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // DB connect/migrate failures must surface as JSON (not a dropped connection).
      const status = /数据库/.test(message) ? 503 : 500;
      return failedJson(message, status);
    }

    if (result.status === "running") {
      const runId = result.runId;
      try {
        after(async () => {
          try {
            await continuePipelineExecute(runId);
          } catch (e) {
            // Best-effort: continuePipelineExecute persists failures itself;
            // log-free swallow to avoid crashing the after callback.
            void e;
          }
        });
      } catch (e) {
        // Host may not support after(); fail the run record rather than hang.
        const message = e instanceof Error ? e.message : String(e);
        return failedJson(
          `无法调度后台 Step8：${message}`,
          500,
          { runId, status: "failed", steps: result.steps, provider: result.provider }
        );
      }
    }

    return NextResponse.json(result, {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "application/json; charset=utf-8",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return failedJson(message, 500);
  }
}
