import { NextResponse } from "next/server";
import { listProviderStatuses } from "@/lib/providers";
import { requireViewer } from "@/lib/require-viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;

  return NextResponse.json(
    { providers: listProviderStatuses() },
    { headers: { "cache-control": "private, no-store" } }
  );
}
