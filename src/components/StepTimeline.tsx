"use client";

import { useState } from "react";
import type { MatchCandidate, PipelineStep, StepStatus } from "@/lib/types";

const statusLabel: Record<StepStatus, string> = {
  waiting: "等待",
  running: "进行中",
  done: "完成",
  skipped: "跳过",
  error: "错误",
};

const statusClass: Record<StepStatus, string> = {
  waiting: "bg-zinc-100 text-zinc-500",
  running: "bg-sky-100 text-sky-800",
  done: "bg-emerald-100 text-emerald-800",
  skipped: "bg-zinc-100 text-zinc-400",
  error: "bg-red-100 text-red-800",
};

function ScoreBars({ candidates }: { candidates: MatchCandidate[] }) {
  const max = Math.max(1, ...candidates.map((c) => c.score));
  return (
    <div className="mt-3 space-y-2">
      {candidates.slice(0, 8).map((c) => (
        <div key={`${c.scope}-${c.name}`}>
          <div className="mb-0.5 flex justify-between text-xs text-zinc-600">
            <span>
              {c.name}{" "}
              <span className="text-zinc-400">[{c.scope}]</span>
              {c.disableModelInvocation ? " · 禁Auto" : ""}
            </span>
            <span>{c.score}</span>
          </div>
          <div className="h-2 rounded bg-zinc-100">
            <div
              className="h-2 rounded bg-emerald-500"
              style={{ width: `${Math.min(100, (c.score / max) * 100)}%` }}
            />
          </div>
          {c.matchedTerms?.length > 0 && (
            <p className="mt-0.5 text-[11px] text-zinc-500">
              matchedTerms: {c.matchedTerms.join(", ")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function StepCard({ step, index }: { step: PipelineStep; index: number }) {
  const [open, setOpen] = useState(false);
  const dataText =
    step.data === undefined
      ? ""
      : typeof step.data === "string"
        ? step.data
        : JSON.stringify(step.data, null, 2);

  const candidates =
    step.id === "match" &&
    step.data &&
    typeof step.data === "object" &&
    Array.isArray((step.data as { candidates?: MatchCandidate[] }).candidates)
      ? ((step.data as { candidates: MatchCandidate[] }).candidates)
      : null;

  return (
    <li className="rounded border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
      >
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
            step.status === "done"
              ? "bg-emerald-600 text-white"
              : step.status === "error"
                ? "bg-red-600 text-white"
                : "bg-zinc-900 text-white"
          }`}
        >
          {step.status === "done" ? "✓" : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-zinc-900">{step.title}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-xs ${statusClass[step.status]}`}
            >
              {statusLabel[step.status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600">{step.explanation}</p>
        </div>
        <span className="shrink-0 text-xs text-zinc-400">
          {open ? "收起" : "详情"}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-zinc-100 px-3 py-3">
          {candidates && <ScoreBars candidates={candidates} />}
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-500">
              原始数据（JSON）
            </p>
            {dataText ? (
              <pre className="max-h-72 overflow-auto rounded bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-100 whitespace-pre-wrap break-all">
                {dataText}
              </pre>
            ) : (
              <p className="text-xs text-zinc-400">无附加数据</p>
            )}
          </div>
          {step.teachNote && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-zinc-800">
              <p className="font-medium">📖 解释说明</p>
              <p className="mt-2">
                <span className="font-medium">做什么：</span>
                {step.teachNote.做什么}
              </p>
              <p className="mt-1">
                <span className="font-medium">Cursor 真实行为：</span>
                {step.teachNote.Cursor真实行为}
              </p>
              <p className="mt-1">
                <span className="font-medium">实验室如何展示：</span>
                {step.teachNote.实验室如何展示}
              </p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                {step.teachNote.要点.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function StepTimeline({ steps }: { steps: PipelineStep[] }) {
  if (!steps.length) {
    return (
      <p className="text-sm text-zinc-500">
        点击「开始运行」后，这里会显示 8 步时间线（含分数条与解释说明）。
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <StepCard key={`${s.id}-${i}`} step={s} index={i} />
      ))}
    </ol>
  );
}
