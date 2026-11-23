import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/require-viewer";
import { listSkillMetadata, scanScopeSummary } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;

  try {
    const skills = await listSkillMetadata();
    const scopes = await scanScopeSummary();
    return NextResponse.json(
      { skills, scopes },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: message, skills: [], scopes: [] },
      { status: 500 }
    );
  }
}
