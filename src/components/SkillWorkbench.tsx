"use client";

import { useMemo, useState } from "react";
import type { SkillDetail, SkillTreeNode } from "@/lib/types";

const TRIGGER_HINTS = [
  "翻译",
  "translate",
  "摘要",
  "会议",
  "blog",
  "url",
  "归档",
];

function Tree({
  nodes,
  active,
  onPick,
}: {
  nodes: SkillTreeNode[];
  active: string;
  onPick: (path: string) => void;
}) {
  return (
    <ul className="space-y-0.5 text-sm">
      {nodes.map((n) => (
        <li key={n.path}>
          {n.type === "dir" ? (
            <div>
              <div className="text-zinc-500">{n.name}/</div>
              <div className="ml-3">
                <Tree
                  nodes={n.children || []}
                  active={active}
                  onPick={onPick}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onPick(n.path)}
              className={`block w-full rounded px-1 py-0.5 text-left ${
                active === n.path
                  ? "bg-zinc-900 text-white"
                  : "hover:bg-zinc-100"
              }`}
            >
              {n.name}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SkillWorkbench({
  skill,
  dependencies,
}: {
  skill: SkillDetail;
  dependencies: {
    scripts: string[];
    prompts: string[];
    references: string[];
    requirements: string[];
  };
}) {
  const [tab, setTab] = useState<
    "preview" | "edit" | "lint" | "deps" | "version"
  >("preview");
  const [filePath, setFilePath] = useState("SKILL.md");
  const [content, setContent] = useState(skill.raw);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const lint = useMemo(() => {
    const issues: string[] = [];
    if (!skill.valid) issues.push(...skill.validationErrors);
    const hasTrigger = TRIGGER_HINTS.some((t) =>
      skill.description.toLowerCase().includes(t.toLowerCase())
    );
    if (!hasTrigger) {
      issues.push("description 建议包含触发词（如 翻译 / blog / 摘要 / 会议）");
    }
    if (skill.lines > 500) {
      issues.push(`SKILL.md 共 ${skill.lines} 行，超过 500 行建议拆分`);
    }
    return issues;
  }, [skill]);

  async function loadFile(path: string) {
    setFilePath(path);
    setStatus(null);
    const res = await fetch(
      `/api/skills/${encodeURIComponent(skill.name)}/file?path=${encodeURIComponent(path)}`
    );
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "读取失败");
      return;
    }
    setContent(data.content);
  }

  async function saveFile() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/skills/${encodeURIComponent(skill.name)}/file`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: filePath, content }),
        }
      );
      const data = await res.json();
      if (!res.ok) setStatus(data.error || "保存失败");
      else setStatus(`已保存 ${filePath}`);
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    ["preview", "预览"],
    ["edit", "编辑"],
    ["lint", "规范检查"],
    ["deps", "依赖"],
    ["version", "版本"],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded px-3 py-1.5 text-sm ${
              tab === id
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded border border-zinc-200 bg-white p-3">
          <p className="mb-2 text-xs font-medium text-zinc-500">文件树</p>
          <Tree
            nodes={skill.files}
            active={filePath}
            onPick={(p) => {
              void loadFile(p);
              if (tab === "preview") setTab("edit");
            }}
          />
        </aside>

        <div className="rounded border border-zinc-200 bg-white p-4">
          {tab === "preview" && (
            <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">
              {filePath === "SKILL.md" ? skill.raw : content}
            </pre>
          )}
          {tab === "edit" && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500">编辑：{filePath}</p>
              <textarea
                className="min-h-[50vh] w-full rounded border border-zinc-300 p-3 font-mono text-sm"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveFile()}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:bg-zinc-400"
              >
                {saving ? "保存中…" : "保存到磁盘"}
              </button>
              {status && <p className="text-sm text-zinc-600">{status}</p>}
            </div>
          )}
          {tab === "lint" && (
            <div className="text-sm">
              {lint.length === 0 ? (
                <p className="text-emerald-700">规范检查通过。</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-amber-900">
                  {lint.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-zinc-500">
                lines={skill.lines} · scope={skill.scope} ·
                disableModelInvocation=
                {String(skill.disableModelInvocation)}
              </p>
            </div>
          )}
          {tab === "deps" && (
            <div className="space-y-2 text-sm text-zinc-800">
              <p>scripts: {dependencies.scripts.join(", ") || "—"}</p>
              <p>prompts: {dependencies.prompts.join(", ") || "—"}</p>
              <p>references: {dependencies.references.join(", ") || "—"}</p>
              <p>
                requirements: {dependencies.requirements.join(", ") || "—"}
              </p>
            </div>
          )}
          {tab === "version" && (
            <div className="text-sm text-zinc-700">
              <p>path: {skill.path}</p>
              <p>lines: {skill.lines}</p>
              <p>folder: {skill.folder}</p>
              <p className="mt-2 text-zinc-500">
                简易版本指纹可用 lines + path（教学用途；正式环境可用
                git/mtime hash）。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
