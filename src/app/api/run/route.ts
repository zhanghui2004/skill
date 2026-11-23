import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import { requireViewer } from "@/lib/require-viewer";
import type { RunMode, RunProvider } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;

  try {
    const body = (await request.json()) as {
      prompt?: string;
      mode?: RunMode;
      provider?: RunProvider;
      skillName?: string;
      baseUrl?: string;
      model?: string;
      autoMatch?: boolean;
    };

    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const autoMatch = body.autoMatch !== false && body.mode !== "manual";
    const mode: RunMode = autoMatch ? "auto" : "manual";
    const provider = body.provider;
    const skillName =
      typeof body.skillName === "string" ? body.skillName : undefined;

    const result = await runPipeline({
      prompt,
      mode,
      provider,
      skillName,
      baseUrl: body.baseUrl,
      model: body.model,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        runId: "error",
        status: "failed",
        steps: [],
        finalAnswer: null,
        selectedSkill: null,
        provider: "cursor",
        toolEvents: [],
        error: message,
      },
      { status: 500 }
    );
  }
}
