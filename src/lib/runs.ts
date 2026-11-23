import fs from "fs/promises";
import path from "path";
import { getRunsDir } from "./paths";
import type { RunRecord, RunResponse } from "./types";

export function createRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveRunRecord(
  record: RunRecord
): Promise<string> {
  const dir = getRunsDir();
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${record.runId}.json`);
  // Ensure no API keys sneak into persisted JSON
  const safe = JSON.parse(
    JSON.stringify(record, (k, v) => {
      if (typeof k === "string" && /api[_-]?key|authorization|secret|token/i.test(k)) {
        return undefined;
      }
      if (typeof v === "string" && /sk-[a-zA-Z0-9]{10,}|crsr_[a-zA-Z0-9]+/i.test(v)) {
        return "[redacted]";
      }
      return v;
    })
  );
  await fs.writeFile(file, JSON.stringify(safe, null, 2), "utf8");
  return file;
}

export async function loadRunRecord(runId: string): Promise<RunRecord | null> {
  try {
    const file = path.join(getRunsDir(), `${runId}.json`);
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as RunRecord;
  } catch {
    return null;
  }
}

export async function listRunRecords(limit = 20): Promise<RunRecord[]> {
  try {
    const dir = getRunsDir();
    const files = (await fs.readdir(dir))
      .filter((f) => f.endsWith(".json"))
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
