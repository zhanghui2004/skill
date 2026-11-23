import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import {
  getPackageRoot,
  getSkillScanRoots,
  getWritableRoot,
} from "./paths";
import type {
  SkillDetail,
  SkillMetadata,
  SkillScope,
  SkillTreeNode,
} from "./types";

function readDisableModelInvocation(data: Record<string, unknown>): boolean {
  const v =
    data["disable-model-invocation"] ??
    data["disableModelInvocation"] ??
    data["disable_model_invocation"];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true" || v === "1";
  return false;
}

function buildValidation(
  data: Record<string, unknown>,
  folder: string
): {
  name: string;
  description: string;
  valid: boolean;
  validationErrors: string[];
} {
  const nameRaw = typeof data.name === "string" ? data.name.trim() : "";
  const descRaw =
    typeof data.description === "string" ? data.description.trim() : "";
  const validationErrors: string[] = [];
  if (!nameRaw) validationErrors.push("缺少 YAML 字段 name");
  if (!descRaw) validationErrors.push("缺少 YAML 字段 description");
  if (nameRaw && nameRaw !== folder) {
    validationErrors.push(
      `name「${nameRaw}」与文件夹名「${folder}」不一致（建议保持一致）`
    );
  }
  return {
    name: nameRaw || folder,
    description: descRaw || "（无描述）",
    valid: Boolean(nameRaw && descRaw),
    validationErrors,
  };
}

async function scanOneRoot(
  scope: SkillScope,
  root: string
): Promise<SkillMetadata[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }

  const out: SkillMetadata[] = [];
  for (const folder of entries) {
    try {
      const dir = path.join(root, folder);
      const st = await fs.stat(dir);
      if (!st.isDirectory()) continue;
      const skillPath = path.join(dir, "SKILL.md");
      const raw = await fs.readFile(skillPath, "utf8");
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;
      const { name, description, valid, validationErrors } = buildValidation(
        data,
        folder
      );
      const lines = raw.split(/\r?\n/).length;
      // Prefer paths relative to package for clients; keep absolutePath for server I/O only
      const rel = path
        .relative(getPackageRoot(), skillPath)
        .split(path.sep)
        .join("/");
      out.push({
        name,
        description,
        path: rel.startsWith("..") ? skillPath : rel,
        folder,
        absolutePath: skillPath,
        scope,
        lines,
        disableModelInvocation: readDisableModelInvocation(data),
        valid,
        validationErrors,
      });
    } catch {
      continue;
    }
  }
  return out;
}

export async function listSkillMetadata(): Promise<SkillMetadata[]> {
  const roots = getSkillScanRoots();
  const all: SkillMetadata[] = [];
  for (const r of roots) {
    all.push(...(await scanOneRoot(r.scope, r.root)));
  }
  // Prefer project scope when names collide
  const byKey = new Map<string, SkillMetadata>();
  const rank: Record<SkillScope, number> = { project: 0, agents: 1, user: 2 };
  for (const s of all) {
    const key = `${s.name}`;
    const prev = byKey.get(key);
    if (!prev || rank[s.scope] < rank[prev.scope]) byKey.set(key, s);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function scanScopeSummary(): Promise<
  Array<{ scope: SkillScope; root: string; label: string; count: number; folders: string[] }>
> {
  const roots = getSkillScanRoots();
  const summary = [];
  for (const r of roots) {
    const skills = await scanOneRoot(r.scope, r.root);
    summary.push({
      scope: r.scope,
      root: r.root,
      label: r.label,
      count: skills.length,
      folders: skills.map((s) => s.folder),
    });
  }
  return summary;
}

async function buildFileTree(dir: string, rel = ""): Promise<SkillTreeNode[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const nodes: SkillTreeNode[] = [];
  for (const name of entries.sort()) {
    if (name === ".git" || name === "node_modules") continue;
    const abs = path.join(dir, name);
    const st = await fs.stat(abs);
    const relPath = rel ? `${rel}/${name}` : name;
    if (st.isDirectory()) {
      nodes.push({
        name,
        path: relPath,
        type: "dir",
        children: await buildFileTree(abs, relPath),
      });
    } else {
      nodes.push({ name, path: relPath, type: "file" });
    }
  }
  return nodes;
}

export async function loadSkillDetail(
  nameOrFolder: string,
  scope?: SkillScope
): Promise<SkillDetail | null> {
  const list = await listSkillMetadata();
  const meta =
    list.find(
      (s) =>
        (s.name === nameOrFolder || s.folder === nameOrFolder) &&
        (!scope || s.scope === scope)
    ) ??
    list.find((s) => s.name === nameOrFolder || s.folder === nameOrFolder) ??
    null;
  if (!meta) return null;

  try {
    const raw = await fs.readFile(meta.absolutePath, "utf8");
    const parsed = matter(raw);
    const dir = path.dirname(meta.absolutePath);
    const files = await buildFileTree(dir);
    return {
      ...meta,
      body: parsed.content.trim(),
      raw,
      frontmatter: parsed.data as Record<string, unknown>,
      files,
    };
  } catch {
    return null;
  }
}

export function toMatchPayload(skills: SkillMetadata[]) {
  return skills.map((s) => ({
    name: s.name,
    description: s.description,
    scope: s.scope,
    disableModelInvocation: s.disableModelInvocation,
  }));
}

export async function readSkillRelativeFile(
  skill: SkillMetadata,
  relativePath: string
): Promise<string> {
  const dir = path.dirname(skill.absolutePath);
  const target = path.resolve(dir, relativePath);
  if (!target.startsWith(dir + path.sep) && target !== dir) {
    throw new Error("拒绝读取 skill 目录外文件");
  }
  return fs.readFile(target, "utf8");
}

export async function writeSkillRelativeFile(
  skill: SkillMetadata,
  relativePath: string,
  content: string
): Promise<void> {
  let dir = path.dirname(skill.absolutePath);
  const pkg = path.resolve(getPackageRoot());
  const writable = path.resolve(getWritableRoot());
  // Hosted package root is read-only — write project skills into writable overlay
  if (
    path.resolve(dir).startsWith(pkg + path.sep) &&
    pkg !== writable
  ) {
    dir = path.join(writable, ".cursor", "skills", skill.folder);
  }
  const target = path.resolve(dir, relativePath);
  if (!target.startsWith(dir + path.sep) && target !== dir) {
    throw new Error("拒绝写入 skill 目录外文件");
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

/** Parse dependency mentions from SKILL.md body. */
export function parseSkillDependencies(raw: string): {
  scripts: string[];
  prompts: string[];
  references: string[];
  requirements: string[];
} {
  const scripts = [
    ...new Set(
      [...raw.matchAll(/scripts\/[\w./-]+/g)].map((m) => m[0])
    ),
  ];
  const prompts = [
    ...new Set(
      [...raw.matchAll(/prompts\/[\w./-]+/g)].map((m) => m[0])
    ),
  ];
  const references = [
    ...new Set(
      [
        ...raw.matchAll(/reference\.md/g),
        ...raw.matchAll(/terminology\.md/g),
      ].map((m) => m[0])
    ),
  ];
  const requirements = raw.includes("requirements.txt")
    ? ["requirements.txt"]
    : [];
  return { scripts, prompts, references, requirements };
}
