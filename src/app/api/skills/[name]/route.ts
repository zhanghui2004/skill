import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/require-viewer";
import { loadSkillDetail, parseSkillDependencies } from "@/lib/skills";
import type { SkillScope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ name: string }> }
) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;

  const { name } = await context.params;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") as SkillScope | null;
  try {
    const skill = await loadSkillDetail(
      decodeURIComponent(name),
      scope || undefined
    );
    if (!skill) {
      return NextResponse.json(
        { error: `找不到 Skill「${name}」` },
        { status: 404 }
      );
    }
    return NextResponse.json(
      {
        skill,
        dependencies: parseSkillDependencies(skill.raw),
      },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
