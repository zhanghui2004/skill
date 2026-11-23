import fs from "fs";
import os from "os";
import path from "path";
import type { SkillScope } from "./types";

/** Bundled app / package root (may be read-only on Lambda-like hosts). */
export function getPackageRoot(): string {
  return process.cwd();
}

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

function isServerlessReadonlyHost(): boolean {
  if (env("LAMBDA_TASK_ROOT") || env("AWS_LAMBDA_FUNCTION_NAME")) return true;
  const cwd = path.resolve(getPackageRoot());
  if (cwd === "/var/task" || cwd.startsWith("/var/task" + path.sep)) return true;
  return false;
}

function canWriteDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.skill-lab-write-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

let cachedWritableRoot: string | null = null;

/**
 * Writable workspace for runs, tool outputs, and agent cwd.
 * Prefer SKILL_LAB_WORKSPACE / SKILL_LAB_DATA_DIR; else project root when
 * writable; else TMPDIR|/tmp/skill-lab on read-only hosts (/var/task).
 */
export function getWritableRoot(): string {
  if (cachedWritableRoot) return cachedWritableRoot;

  const explicit = env("SKILL_LAB_WORKSPACE") || env("SKILL_LAB_DATA_DIR");
  if (explicit) {
    const resolved = path.resolve(explicit);
    fs.mkdirSync(path.join(resolved, "data", "runs"), { recursive: true });
    cachedWritableRoot = resolved;
    return resolved;
  }

  const pkg = path.resolve(getPackageRoot());
  const localData = path.join(pkg, "data");
  if (!isServerlessReadonlyHost() && canWriteDir(localData)) {
    cachedWritableRoot = pkg;
    return pkg;
  }

  const tmpBase = env("TMPDIR") || os.tmpdir() || "/tmp";
  const root = path.join(tmpBase, "skill-lab");
  fs.mkdirSync(path.join(root, "data", "runs"), { recursive: true });
  cachedWritableRoot = root;
  return root;
}

/** @deprecated alias — tools and agent cwd use the writable root. */
export function getProjectRoot(): string {
  return getWritableRoot();
}

export function getRunsDir(): string {
  return path.join(getWritableRoot(), "data", "runs");
}

export function getPersonalSkillsDir(): string {
  const override = env("SKILL_LAB_PERSONAL_DIR");
  if (override) return path.resolve(override);
  return path.join(os.homedir(), ".cursor", "skills");
}

export interface SkillScanRoot {
  scope: SkillScope;
  root: string;
  label: string;
}

/** Multi-directory skill roots (missing dirs are OK). Bundled skills from package. */
export function getSkillScanRoots(): SkillScanRoot[] {
  const pkg = getPackageRoot();
  const writable = getWritableRoot();
  const roots: SkillScanRoot[] = [
    {
      scope: "project",
      root: path.join(pkg, ".cursor", "skills"),
      label: ".cursor/skills/ (package)",
    },
    {
      scope: "agents",
      root: path.join(pkg, ".agents", "skills"),
      label: ".agents/skills/ (agents)",
    },
  ];
  if (path.resolve(writable) !== path.resolve(pkg)) {
    roots.push({
      scope: "project",
      root: path.join(writable, ".cursor", "skills"),
      label: ".cursor/skills/ (writable overlay)",
    });
  }
  roots.push({
    scope: "user",
    root: getPersonalSkillsDir(),
    label: "personal skills (user)",
  });
  return roots;
}

export function safeJoinWorkspace(...parts: string[]): string {
  const root = path.resolve(getWritableRoot());
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`路径越界：拒绝访问工作区外文件 ${target}`);
  }
  return target;
}

export function ensureDirSync(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Reset cached root (tests). */
export function resetWritableRootCache(): void {
  cachedWritableRoot = null;
}
