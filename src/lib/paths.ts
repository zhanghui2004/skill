import fs from "fs";
import os from "os";
import path from "path";
import type { SkillScope } from "./types";

export function getProjectRoot(): string {
  return process.env.SKILL_LAB_WORKSPACE?.trim() || process.cwd();
}

export function getRunsDir(): string {
  return path.join(getProjectRoot(), "data", "runs");
}

export function getPersonalSkillsDir(): string {
  const override = process.env.SKILL_LAB_PERSONAL_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(os.homedir(), ".cursor", "skills");
}

export interface SkillScanRoot {
  scope: SkillScope;
  root: string;
  label: string;
}

/** Multi-directory skill roots (missing dirs are OK). */
export function getSkillScanRoots(): SkillScanRoot[] {
  const project = getProjectRoot();
  return [
    {
      scope: "project",
      root: path.join(project, ".cursor", "skills"),
      label: ".cursor/skills/ (project)",
    },
    {
      scope: "agents",
      root: path.join(project, ".agents", "skills"),
      label: ".agents/skills/ (agents)",
    },
    {
      scope: "user",
      root: getPersonalSkillsDir(),
      label: "personal skills (user)",
    },
  ];
}

export function safeJoinWorkspace(...parts: string[]): string {
  const root = path.resolve(getProjectRoot());
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`路径越界：拒绝访问工作区外文件 ${target}`);
  }
  return target;
}

export function ensureDirSync(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
