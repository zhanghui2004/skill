import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getPackageRoot,
  getRunsDir,
  getSdkAgentStoreDir,
  getSkillScanRoots,
  getWritableRoot,
  resetWritableRootCache,
} from "./paths";
import { listSkillMetadata, scanScopeSummary } from "./skills";

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
    expect(getPackageRoot()).toBe(path.resolve("/var/task"));
    const store = getSdkAgentStoreDir();
    expect(store).toBe(path.join(root, "sdk-agent-store"));
    expect(fs.existsSync(store)).toBe(true);
    expect(store.includes(`${path.sep}.cursor${path.sep}`)).toBe(false);
  });

  it("still discovers bundled skills when writable is /tmp (hosted)", async () => {
    clearKeys();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skill-lab-host-"));
    // Package root = this workspace; writable forced to tmp via serverless flags
    process.env.LAMBDA_TASK_ROOT = process.cwd();
    process.env.AWS_LAMBDA_FUNCTION_NAME = "skill-lab-test";
    process.env.TMPDIR = tmp;
    resetWritableRootCache();

    expect(getWritableRoot()).toBe(path.join(tmp, "skill-lab"));
    expect(getPackageRoot()).toBe(path.resolve(process.cwd()));

    const roots = getSkillScanRoots();
    expect(
      roots.some((r) => r.root.includes("bundled-skills") && r.scope === "project")
    ).toBe(true);

    const skills = await listSkillMetadata();
    expect(skills.map((s) => s.name)).toEqual(
      expect.arrayContaining([
        "english-blog-translate",
        "translate",
        "summarize",
        "meeting-notes",
      ])
    );

    const summary = await scanScopeSummary();
    const projectTotal = summary
      .filter((s) => s.scope === "project")
      .reduce((a, s) => a + s.count, 0);
    expect(projectTotal).toBeGreaterThanOrEqual(4);
  });
});
