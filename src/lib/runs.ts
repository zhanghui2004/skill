import fs from "fs/promises";
import path from "path";
import { hasDatabase, sql } from "./db";
import { getRunsDir } from "./paths";
import type { RunRecord, RunResponse } from "./types";

/** Matches createRunId(); rejects path segments and traversal. */
const RUN_ID_RE = /^run_[a-zA-Z0-9]+_[a-zA-Z0-9]+$/;

export function createRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function resolveRunRecordPath(runId: string): string {
  if (!RUN_ID_RE.test(runId)) {
    throw new Error("无效的 runId");
  }
  const dir = path.resolve(getRunsDir());
  const file = path.resolve(dir, `${runId}.json`);
  if (file !== dir && !file.startsWith(dir + path.sep)) {
    throw new Error("runId 路径越界");
  }
  if (path.basename(file) !== `${runId}.json`) {
    throw new Error("无效的 runId");
  }
  return file;
}

function scrubRecord(record: RunRecord): RunRecord {
  return JSON.parse(
    JSON.stringify(record, (k, v) => {
      if (
        typeof k === "string" &&
        /api[_-]?key|authorization|secret|token/i.test(k)
      ) {
        return undefined;
      }
      if (
        typeof v === "string" &&
        /sk-[a-zA-Z0-9]{10,}|crsr_[a-zA-Z0-9]+/i.test(v)
      ) {
        return "[redacted]";
      }
      return v;
    })
  ) as RunRecord;
}

async function saveRunRecordFile(record: RunRecord): Promise<string> {
  const dir = getRunsDir();
  await fs.mkdir(dir, { recursive: true });
  const file = resolveRunRecordPath(record.runId);
  await fs.writeFile(file, JSON.stringify(record, null, 2), "utf8");
  return file;
}

async function loadRunRecordFile(runId: string): Promise<RunRecord | null> {
  try {
    const file = resolveRunRecordPath(runId);
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as RunRecord;
  } catch {
    return null;
  }
}

/**
 * Durable when DATABASE_URL is set (shared Postgres across serverless instances).
 * Local/dev without DATABASE_URL keeps the filesystem under the writable root.
 */
export async function saveRunRecord(record: RunRecord): Promise<string> {
  if (!RUN_ID_RE.test(record.runId)) {
    throw new Error("无效的 runId");
  }
  const safe = scrubRecord(record);

  if (hasDatabase()) {
    await sql(
      `insert into runs (run_id, payload, status, created_at, updated_at)
       values ($1, $2::jsonb, $3, coalesce(($2::jsonb->>'createdAt')::timestamptz, now()), now())
       on conflict (run_id) do update set
         payload = excluded.payload,
         status = excluded.status,
         updated_at = now()`,
      [safe.runId, JSON.stringify(safe), safe.status]
    );
    return `db:${safe.runId}`;
  }

  return saveRunRecordFile(safe);
}

export async function loadRunRecord(runId: string): Promise<RunRecord | null> {
  if (!RUN_ID_RE.test(runId)) return null;

  if (hasDatabase()) {
    try {
      const rows = await sql<{ payload: RunRecord }>(
        `select payload from runs where run_id = $1`,
        [runId]
      );
      if (!rows[0]) return null;
      const payload = rows[0].payload;
      // pg may already parse jsonb
      if (typeof payload === "string") {
        return JSON.parse(payload) as RunRecord;
      }
      return payload as RunRecord;
    } catch {
      return null;
    }
  }

  return loadRunRecordFile(runId);
}

export async function listRunRecords(limit = 20): Promise<RunRecord[]> {
  if (hasDatabase()) {
    try {
      const rows = await sql<{ payload: RunRecord }>(
        `select payload from runs order by created_at desc limit $1`,
        [limit]
      );
      return rows.map((r) => {
        const payload = r.payload;
        if (typeof payload === "string") {
          return JSON.parse(payload) as RunRecord;
        }
        return payload as RunRecord;
      });
    } catch {
      return [];
    }
  }

  try {
    const dir = getRunsDir();
    const files = (await fs.readdir(dir))
      .filter((f) => f.endsWith(".json") && RUN_ID_RE.test(f.slice(0, -5)))
      .sort()
      .reverse()
      .slice(0, limit);
    const out: RunRecord[] = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf8");
        out.push(JSON.parse(raw) as RunRecord);
      } catch {
        continue;
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function toRunResponse(record: RunRecord): RunResponse {
  return {
    runId: record.runId,
    status: record.status,
    steps: record.steps,
    finalAnswer: record.finalAnswer,
    selectedSkill: record.selectedSkill,
    provider: record.provider,
    toolEvents: record.toolEvents,
    explanation: record.explanation,
    error: record.error,
  };
}
