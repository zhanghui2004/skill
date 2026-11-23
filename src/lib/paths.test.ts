import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getPackageRoot,
  getRunsDir,
  getWritableRoot,
  resetWritableRootCache,
} from "./paths";

const KEYS = [
  "SKILL_LAB_WORKSPACE",
  "SKILL_LAB_DATA_DIR",
  "TMPDIR",
  "LAMBDA_TASK_ROOT",
  "AWS_LAMBDA_FUNCTION_NAME",
] as const;

const snap: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

afterEach(() => {
  for (const k of KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
  resetWritableRootCache();
});

function clearKeys() {
  for (const k of KEYS) {
    snap[k] = process.env[k];
    delete process.env[k];
  }
  resetWritableRootCache();
}

describe("writable roots", () => {
  it("uses SKILL_LAB_DATA_DIR when set", () => {
    clearKeys();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-lab-data-"));
    process.env.SKILL_LAB_DATA_DIR = dir;
    resetWritableRootCache();
    expect(getWritableRoot()).toBe(path.resolve(dir));
    expect(getRunsDir()).toBe(path.join(path.resolve(dir), "data", "runs"));
    expect(fs.existsSync(getRunsDir())).toBe(true);
  });

  it("falls back under TMPDIR when LAMBDA_TASK_ROOT is set", () => {
    clearKeys();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skill-lab-tmp-"));
    process.env.LAMBDA_TASK_ROOT = "/var/task";
    process.env.TMPDIR = tmp;
    resetWritableRootCache();
    const root = getWritableRoot();
    expect(root).toBe(path.join(tmp, "skill-lab"));
    expect(getRunsDir().startsWith(root)).toBe(true);
    expect(getPackageRoot()).toBe(process.cwd());
  });
});
