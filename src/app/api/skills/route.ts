import { NextResponse } from "next/server";
import { listSkillMetadata, scanScopeSummary } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const skills = await listSkillMetadata();
    const scopes = await scanScopeSummary();
    return NextResponse.json({ skills, scopes });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: message, skills: [], scopes: [] },
      { status: 500 }
    );
  }
}
