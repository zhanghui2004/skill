import { NextResponse } from "next/server";
import {
  listSkillMetadata,
  readSkillRelativeFile,
  writeSkillRelativeFile,
} from "@/lib/skills";
import { requireViewer } from "@/lib/require-viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ name: string }> }
) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;

  const { name } = await context.params;
  const rel = new URL(request.url).searchParams.get("path") || "SKILL.md";
  const meta = (await listSkillMetadata()).find(
    (s) => s.name === decodeURIComponent(name) || s.folder === decodeURIComponent(name)
  );
  if (!meta) {
    return NextResponse.json({ error: "Skill 不存在" }, { status: 404 });
  }
  try {
    const content = await readSkillRelativeFile(meta, rel);
    return NextResponse.json({ path: rel, content });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ name: string }> }
) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;

  const { name } = await context.params;
  const body = (await request.json()) as { path?: string; content?: string };
  const rel = body.path || "SKILL.md";
  const meta = (await listSkillMetadata()).find(
    (s) => s.name === decodeURIComponent(name) || s.folder === decodeURIComponent(name)
  );
  if (!meta) {
    return NextResponse.json({ error: "Skill 不存在" }, { status: 404 });
  }
  try {
    await writeSkillRelativeFile(meta, rel, body.content ?? "");
    return NextResponse.json({ ok: true, path: rel });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
