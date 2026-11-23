import fs from "fs";
import os from "os";
import path from "path";
import type { SkillScope } from "./types";

/**
 * Bundled app / package root (may be read-only on Lambda-like hosts).
 * Prefer LAMBDA_TASK_ROOT when set — Next/Lambda cwd can differ.
 */
export function getPackageRoot(): string {
  const lambda = process.env.LAMBDA_TASK_ROOT?.trim();
  if (lambda) return path.resolve(lambda);
  return path.resolve(process.cwd());
}

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

function isServerlessReadonlyHost(): boolean {
  if (env("LAMBDA_TASK_ROOT") || env("AWS_LAMBDA_FUNCTION_NAME")) return true;
  const cwd = path.resolve(process.cwd());
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
let skillsMirrored = false;

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
    mirrorBundledSkillsIntoWritable();
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
  mirrorBundledSkillsIntoWritable();
  return root;
}

/**
 * Copy packaged skills into the writable cwd so relative tool paths work.
 * Does not replace package scan — scanning still reads the package first.
 */
export function mirrorBundledSkillsIntoWritable(): void {
  if (skillsMirrored) return;
  const pkg = path.resolve(getPackageRoot());
  const writable = cachedWritableRoot || path.resolve(getWritableRoot());
  if (pkg === writable) {
    skillsMirrored = true;
    return;
  }

  const sources = [
    path.join(pkg, "bundled-skills"),
    path.join(pkg, ".cursor", "skills"),
  ];
  const src = sources.find((p) => {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  });
  if (!src) {
    skillsMirrored = true;
    return;
  }

  const dests = [
    path.join(writable, "bundled-skills"),
    path.join(writable, ".cursor", "skills"),
  ];
  for (const dest of dests) {
    try {
      if (fs.existsSync(dest)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
    } catch {
      // best-effort; package scan still works for discovery
    }
  }
  skillsMirrored = true;
}

/** Tools and agent cwd use the writable root. */
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

function dirIfExists(dir: string): string | null {
  try {
    if (fs.statSync(dir).isDirectory()) return dir;
  } catch {
    /* missing */
  }
  return null;
}

/**
 * Multi-directory skill roots. Package bundled skills first (read-only OK),
 * then writable overlays. Missing dirs are OK.
 */
export function getSkillScanRoots(): SkillScanRoot[] {
  const pkg = getPackageRoot();
  // Ensure writable exists (and optional mirror) without replacing package scan
  let writable: string;
  try {
    writable = getWritableRoot();
  } catch {
    writable = pkg;
  }

  const roots: SkillScanRoot[] = [];
  const seen = new Set<string>();

  const push = (scope: SkillScope, root: string, label: string) => {
    const resolved = path.resolve(root);
    if (seen.has(resolved)) return;
    if (!dirIfExists(resolved)) return;
    seen.add(resolved);
    roots.push({ scope, root: resolved, label });
  };

  // 1) Non-hidden deploy path (survives packs that strip `.cursor`)
  push("project", path.join(pkg, "bundled-skills"), "bundled-skills/ (package)");
  // 2) Classic project skills under package
  push(
    "project",
    path.join(pkg, ".cursor", "skills"),
    ".cursor/skills/ (package)"
  );
  push("agents", path.join(pkg, ".agents", "skills"), ".agents/skills/ (agents)");

  // 3) Writable overlays (after package — merge, do not replace)
  if (path.resolve(writable) !== path.resolve(pkg)) {
    push(
      "project",
      path.join(writable, "bundled-skills"),
      "bundled-skills/ (writable)"
    );
    push(
      "project",
      path.join(writable, ".cursor", "skills"),
      ".cursor/skills/ (writable)"
    );
  }

  push("user", getPersonalSkillsDir(), "personal skills (user)");
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
  skillsMirrored = false;
}
