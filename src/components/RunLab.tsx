"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StepTimeline } from "./StepTimeline";
import type {
  PipelineStep,
  ProviderStatus,
  RunExplanation,
  RunResponse,
  SkillMetadata,
  ToolEvent,
} from "@/lib/types";

export function RunLab() {
  const searchParams = useSearchParams();
  const [prompt, setPrompt] = useState(
    "翻译 https://waitbutwhy.com/2023/05/baby.html 并归档中文译文"
  );
  const [provider, setProvider] = useState<"cursor" | "openai" | "auto">("auto");
  const [autoMatch, setAutoMatch] = useState(true);
  const [skillName, setSkillName] = useState("");
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [finalAnswer, setFinalAnswer] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<
    "idle" | "running" | "completed" | "failed"
  >("idle");
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [explanation, setExplanation] = useState<RunExplanation | null>(null);
  const [resolvedProvider, setResolvedProvider] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get("skill");
    fetch("/api/skills")
      .then((r) => r.json())
      .then((data: { skills?: SkillMetadata[] }) => {
        const list = data.skills ?? [];
        setSkills(list);
        if (q && list.some((s) => s.name === q || s.folder === q)) {
          setSkillName(q);
          setAutoMatch(false);
        } else if (list[0]) setSkillName(list[0].name);
      })
      .catch(() => setSkills([]));

    fetch("/api/providers")
      .then((r) => r.json())
      .then((data: { providers?: ProviderStatus[] }) => {
        const list = data.providers ?? [];
        setProviders(list);
        const cursor = list.find((p) => p.provider === "cursor");
        const openai = list.find((p) => p.provider === "openai");
        if (cursor?.hasApiKey) setProvider("cursor");
        else if (openai?.hasApiKey) setProvider("openai");
        if (openai) {
          setBaseUrl(openai.baseUrl);
          setModel(openai.model);
        }
        if (cursor && (!openai || cursor.hasApiKey)) {
          setModel(cursor.model);
        }
      })
      .catch(() => setProviders([]));
  }, [searchParams]);

  const activeProviderMeta = useMemo(() => {
    const key = provider === "auto" ? undefined : provider;
    if (key) return providers.find((p) => p.provider === key);
    return (
      providers.find((p) => p.hasApiKey) ||
      providers.find((p) => p.provider === "cursor")
    );
  }, [provider, providers]);

  const progressDone = steps.filter((s) =>
    ["done", "skipped", "error"].includes(s.status)
  ).length;

  async function onRun() {
    setLoading(true);
    setError(null);
    setFinalAnswer(null);
    setSelectedSkill(null);
    setSteps([]);
    setToolEvents([]);
    setExplanation(null);
    setRunId(null);
    setRunStatus("running");
    setResolvedProvider(null);

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          autoMatch,
          mode: autoMatch ? "auto" : "manual",
          provider: provider === "auto" ? "auto" : provider,
          skillName: autoMatch ? undefined : skillName,
          baseUrl: provider === "openai" ? baseUrl || undefined : undefined,
          model: model || undefined,
        }),
      });
      const data = (await res.json()) as RunResponse;
      setSteps(data.steps ?? []);
      setFinalAnswer(data.finalAnswer);
      setSelectedSkill(data.selectedSkill);
      setToolEvents(data.toolEvents ?? []);
      setExplanation(data.explanation ?? null);
      setRunId(data.runId);
      setResolvedProvider(data.provider);
      setRunStatus(data.status === "failed" ? "failed" : "completed");
      if (data.error) setError(data.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRunStatus("failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <section className="space-y-4">
        <fieldset className="space-y-2 rounded border border-zinc-200 bg-white p-3">
          <legend className="px-1 text-sm font-medium text-zinc-800">
            Run Provider
          </legend>
          {(
            [
              ["auto", "自动（按已配置 Key）"],
              ["cursor", "Cursor Agent"],
              ["openai", "OpenAI-compatible Agent"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex items-center gap-2 text-sm text-zinc-700"
            >
              <input
                type="radio"
                name="provider"
                checked={provider === value}
                onChange={() => setProvider(value)}
              />
              {label}
            </label>
          ))}
          <p className="text-xs text-zinc-500">
            当前{" "}
            {activeProviderMeta ? (
              <>
                <span className="font-medium">{activeProviderMeta.label}</span>
                ：Key{" "}
                {activeProviderMeta.hasApiKey ? (
                  <span className="text-emerald-700">已配置</span>
                ) : (
                  <span className="text-amber-700">未配置（请写 .env.local）</span>
                )}
              </>
            ) : (
              "加载中…"
            )}
          </p>
          {!activeProviderMeta?.hasApiKey && (
            <p className="text-xs text-amber-800">
              提示：Cursor 用 SKILL_LAB_CURSOR_KEY（发布）或本地 CURSOR_API_KEY；兼容通道用
              OPENAI_API_KEY / DEEPSEEK_API_KEY / LLM_API_KEY。切勿把密钥贴到聊天。
            </p>
          )}
        </fieldset>

        {provider === "openai" && (
          <div className="space-y-2 rounded border border-zinc-200 bg-white p-3">
            <label className="block text-xs font-medium text-zinc-700">
              AI_BASE_URL
              <input
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              AI_MODEL
              <input
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4.1-mini"
              />
            </label>
          </div>
        )}

        {provider === "cursor" && (
          <label className="block text-xs font-medium text-zinc-700">
            AI_MODEL（Cursor）
            <input
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="composer-2.5"
            />
          </label>
        )}

        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={autoMatch}
            onChange={(e) => setAutoMatch(e.target.checked)}
          />
          Auto 匹配（按 description 启发式打分；关闭则强制指定 Skill）
        </label>

        {!autoMatch && (
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-800">
              强制 Skill
            </label>
            <select
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              {skills.map((s) => (
                <option key={`${s.scope}-${s.folder}`} value={s.name}>
                  [{s.scope}] {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-800">
            测试 Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={7}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 outline-none focus:border-zinc-500"
          />
        </div>

        <button
          type="button"
          onClick={onRun}
          disabled={loading || !prompt.trim()}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {loading ? "运行中…" : "开始运行"}
        </button>

        <div className="rounded border border-zinc-200 bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-zinc-500">runId:</span>
            <code className="text-xs">{runId || "—"}</code>
            <span
              className={`rounded px-1.5 py-0.5 text-xs ${
                runStatus === "running"
                  ? "bg-sky-100 text-sky-800"
                  : runStatus === "completed"
                    ? "bg-emerald-100 text-emerald-800"
                    : runStatus === "failed"
                      ? "bg-red-100 text-red-800"
                      : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {runStatus}
            </span>
            {resolvedProvider && (
              <span className="text-xs text-zinc-500">
                provider={resolvedProvider}
              </span>
            )}
          </div>
          <div className="mt-2">
            <div className="mb-1 flex justify-between text-xs text-zinc-500">
              <span>8 段进度</span>
              <span>
                {progressDone}/8
              </span>
            </div>
            <div className="grid grid-cols-8 gap-1">
              {Array.from({ length: 8 }).map((_, i) => {
                const s = steps[i];
                const color =
                  !s
                    ? "bg-zinc-200"
                    : s.status === "done"
                      ? "bg-emerald-500"
                      : s.status === "error"
                        ? "bg-red-500"
                        : s.status === "skipped"
                          ? "bg-zinc-400"
                          : "bg-sky-400";
                return <div key={i} className={`h-2 rounded ${color}`} />;
              })}
            </div>
          </div>
          {runId && (
            <p className="mt-2 text-xs">
              <Link className="text-sky-700 hover:underline" href={`/runs/${runId}`}>
                查看完整运行报告 →
              </Link>
            </p>
          )}
        </div>

        {selectedSkill && (
          <p className="text-sm text-zinc-600">
            本次选定 Skill：
            <Link
              href={`/skills/${encodeURIComponent(selectedSkill)}`}
              className="font-medium text-zinc-900 hover:underline"
            >
              {" "}
              {selectedSkill}
            </Link>
          </p>
        )}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">
            8 步时间线
          </h2>
          <StepTimeline steps={steps} />
        </div>

        {toolEvents.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">
              工具事件（{toolEvents.length}）
            </h2>
            <ul className="max-h-48 space-y-1 overflow-auto rounded border border-zinc-200 bg-white p-2 text-xs">
              {toolEvents.map((e, i) => (
                <li key={`${e.callId}-${i}`} className="text-zinc-700">
                  <span className="font-medium">{e.name}</span> · {e.status}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">最终回答</h2>
          {finalAnswer ? (
            <pre className="whitespace-pre-wrap break-words rounded border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-800">
              {finalAnswer}
            </pre>
          ) : (
            <p className="text-sm text-zinc-500">
              {loading ? "Agent 运行中…" : "运行完成后显示模型回答。"}
            </p>
          )}
        </div>

        {explanation && (
          <div className="rounded border border-zinc-200 bg-white p-4 text-sm">
            <h2 className="font-semibold text-zinc-900">解释报告摘要</h2>
            <dl className="mt-2 space-y-1 text-zinc-700">
              <div>
                <dt className="inline font-medium">任务：</dt>
                <dd className="inline">{explanation.task}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Provider / 模式：</dt>
                <dd className="inline">
                  {explanation.provider} / {explanation.mode}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium">最终 Skill：</dt>
                <dd className="inline">{explanation.finalSkill || "—"}</dd>
              </div>
              <div>
                <dt className="font-medium">为何选中：</dt>
                <dd>{explanation.whySelected}</dd>
              </div>
              <div>
                <dt className="font-medium">Step7：</dt>
                <dd>{explanation.step7Summary}</dd>
              </div>
              <div>
                <dt className="font-medium">Step8：</dt>
                <dd>{explanation.step8Summary}</dd>
              </div>
            </dl>
            <ul className="mt-2 list-disc pl-5 text-zinc-700">
              {explanation.resultChecks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
