import path from "path";
import { runCursorAgent } from "./agent-cursor";
import { runOpenAICompatibleAgent } from "./agent-openai";
import { extractUrl, hasUrl, matchByHeuristic } from "./match";
import {
  getMaxIterations,
  getProviderStatus,
  resolveProvider,
} from "./providers";
import { createRunId, saveRunRecord } from "./runs";
import {
  listSkillMetadata,
  loadSkillDetail,
  parseSkillDependencies,
  scanScopeSummary,
  toMatchPayload,
} from "./skills";
import { STEP_TEACH_NOTES } from "./teach-notes";
import type {
  PipelineStep,
  RunExplanation,
  RunMode,
  RunProvider,
  RunRecord,
  RunResponse,
  StepStatus,
  ToolEvent,
} from "./types";

function step(
  id: string,
  title: string,
  status: StepStatus,
  explanation: string,
  data?: unknown
): PipelineStep {
  return {
    id,
    title,
    status,
    explanation,
    data,
    teachNote: STEP_TEACH_NOTES[id],
  };
}

function flattenTreePaths(
  nodes: Array<{ path: string; type: string; children?: unknown[] }>,
  acc: string[] = []
): string[] {
  for (const n of nodes) {
    acc.push(n.path);
    if (n.children) flattenTreePaths(n.children as typeof nodes, acc);
  }
  return acc;
}

export async function runPipeline(options: {
  prompt: string;
  mode: RunMode;
  provider?: RunProvider;
  skillName?: string;
  model?: string;
}): Promise<RunResponse> {
  const runId = createRunId();
  const steps: PipelineStep[] = [];
  const finalAnswer: string | null = null;
  let selectedSkill: string | null = null;
  let error: string | undefined;
  const toolEvents: ToolEvent[] = [];
  let status: RunResponse["status"] = "completed";

  const prompt = options.prompt?.trim() ?? "";
  const mode: RunMode = options.mode === "manual" ? "manual" : "auto";
  const provider = resolveProvider(options.provider);
  // baseUrl comes only from server env/defaults inside getProviderStatus
  const providerStatus = getProviderStatus(provider, {
    model: options.model,
  });

  // 1. 初始化
  steps.push(
    step(
      "init",
      "初始化",
      "done",
      "读取 Provider / Key 状态 / 模型与迭代上限（不展示密钥）。",
      {
        runId,
        provider,
        hasApiKey: providerStatus.hasApiKey,
        baseUrl: providerStatus.baseUrl,
        model: providerStatus.model,
        maxIterations: getMaxIterations(),
        mode,
        scopes: ["project", "agents", "user"],
      }
    )
  );

  // 2. 扫描目录
  const scopeSummary = await scanScopeSummary();
  steps.push(
    step(
      "scan",
      "扫描目录",
      "done",
      "多目录扫描：project / agents / user；缺失目录记 0。",
      { scopes: scopeSummary, total: scopeSummary.reduce((a, s) => a + s.count, 0) }
    )
  );

  // 3. YAML
  const metadata = await listSkillMetadata();
  steps.push(
    step(
      "parse-yaml",
      "解析 YAML 头",
      "done",
      "渐进式披露：仅 name/description/path/lines/disableModelInvocation。",
      {
        skills: metadata.map((s) => ({
          name: s.name,
          description: s.description,
          path: s.path,
          scope: s.scope,
          lines: s.lines,
          disableModelInvocation: s.disableModelInvocation,
          valid: s.valid,
          validationErrors: s.validationErrors,
        })),
        note: "body 未加载",
      }
    )
  );

  // 4. Prompt
  if (!prompt) {
    steps.push(
      step("prompt", "接收 Prompt", "error", "用户未提供有效 Prompt。", {
        prompt,
      })
    );
    for (const [id, title, explanation] of [
      ["match", "Skill 匹配", "因 Prompt 为空而跳过"],
      ["select", "选择 Skill", "因 Prompt 为空而跳过"],
      ["load", "加载 Skill 内容", "因 Prompt 为空而跳过"],
      ["execute", "执行", "因 Prompt 为空而跳过"],
    ] as const) {
      steps.push(step(id, title, "skipped", explanation));
    }
    error = "请输入 Prompt 后再运行。";
    status = "failed";
    return persist({
      runId,
      status,
      steps,
      finalAnswer,
      selectedSkill,
      provider,
      toolEvents,
      error,
      prompt,
      mode,
    });
  }

  steps.push(
    step("prompt", "接收 Prompt", "done", "记录用户输入与 URL 检测。", {
      prompt,
      charCount: prompt.length,
      hasUrl: hasUrl(prompt),
      url: extractUrl(prompt),
      preselected: mode === "manual" ? options.skillName || null : null,
    })
  );

  // 5–6 match/select
  const matchPayload = toMatchPayload(metadata);
  const matchResult =
    mode === "manual"
      ? matchByHeuristic(prompt, matchPayload, {
          forcedSkill: options.skillName?.trim() || undefined,
        })
      : matchByHeuristic(prompt, matchPayload);

  steps.push(
    step(
      "match",
      "Skill 匹配",
      matchResult.error && mode === "auto" ? "error" : "done",
      "启发式打分：token 重叠 + 触发词 + URL 加权（可解释）。",
      {
        method: matchResult.method,
        reason: matchResult.reason,
        candidates: matchResult.candidates,
        error: matchResult.error,
      }
    )
  );

  if (mode === "manual") {
    const forced = options.skillName?.trim();
    if (!forced) {
      steps.push(
        step("select", "选择 Skill", "error", "未勾选 Auto 时需指定 Skill。", {
          skillName: null,
        })
      );
      steps.push(step("load", "加载 Skill 内容", "skipped", "未选定 Skill。"));
      steps.push(step("execute", "执行", "skipped", "未选定 Skill。"));
      error = "请选择一个 Skill，或勾选 Auto 匹配。";
      status = "failed";
      return persist({
        runId,
        status,
        steps,
        finalAnswer,
        selectedSkill,
        provider,
        toolEvents,
        error,
        prompt,
        mode,
      });
    }
    const exists = metadata.some((s) => s.name === forced || s.folder === forced);
    if (!exists) {
      steps.push(
        step("select", "选择 Skill", "error", `找不到 Skill「${forced}」。`, {
          skillName: forced,
        })
      );
      steps.push(step("load", "加载 Skill 内容", "skipped", "Skill 不存在。"));
      steps.push(step("execute", "执行", "skipped", "Skill 不存在。"));
      error = `找不到 Skill「${forced}」。`;
      status = "failed";
      return persist({
        runId,
        status,
        steps,
        finalAnswer,
        selectedSkill,
        provider,
        toolEvents,
        error,
        prompt,
        mode,
      });
    }
    selectedSkill = metadata.find(
      (s) => s.name === forced || s.folder === forced
    )!.name;
    steps.push(
      step("select", "选择 Skill", "done", "实验室指定（Force 模式）。", {
        selected: selectedSkill,
        method: "manual",
        label: "实验室指定",
        scores: matchResult.candidates,
      })
    );
  } else if (!matchResult.selected) {
    steps.push(
      step("select", "选择 Skill", "error", "没有匹配的 skill", {
        selected: null,
        candidates: matchResult.candidates,
      })
    );
    steps.push(step("load", "加载 Skill 内容", "skipped", "无匹配，跳过加载。"));
    steps.push(step("execute", "执行", "skipped", "无匹配，跳过执行。"));
    error = "没有匹配的 skill";
    status = "failed";
    return persist({
      runId,
      status,
      steps,
      finalAnswer,
      selectedSkill,
      provider,
      toolEvents,
      error,
      prompt,
      mode,
      explanation: buildExplanation({
        prompt,
        provider,
        mode,
        selectedSkill: null,
        why: matchResult.reason,
        steps,
        toolEvents: [],
        finalAnswer: null,
      }),
    });
  } else {
    selectedSkill = matchResult.selected;
    steps.push(
      step("select", "选择 Skill", "done", matchResult.reason, {
        selected: selectedSkill,
        method: matchResult.method,
        top: matchResult.candidates[0],
      })
    );
  }

  // 7. Load
  const detail = await loadSkillDetail(selectedSkill!);
  if (!detail) {
    steps.push(
      step("load", "加载 Skill 内容", "error", `无法读取「${selectedSkill}」。`, {
        selected: selectedSkill,
      })
    );
    steps.push(step("execute", "执行", "skipped", "加载失败。"));
    error = `无法加载 Skill「${selectedSkill}」。`;
    status = "failed";
    return persist({
      runId,
      status,
      steps,
      finalAnswer,
      selectedSkill,
      provider,
      toolEvents,
      error,
      prompt,
      mode,
    });
  }

  const deps = parseSkillDependencies(detail.raw);
  const filePaths = flattenTreePaths(detail.files);
  steps.push(
    step(
      "load",
      "加载 Skill 内容",
      "done",
      "匹配后加载 SKILL.md 与附属文件清单（prompts/scripts/reference…）。",
      {
        name: detail.name,
        path: detail.path,
        scope: detail.scope,
        bodyLength: detail.body.length,
        body: detail.body,
        files: filePaths,
        dependencies: deps,
      }
    )
  );

  // 8. Execute — deferred so HTTP can return steps 1–7 before gateway timeout.
  if (!providerStatus.hasApiKey) {
    const msg =
      provider === "cursor"
        ? "未配置 Cursor API Key。请设置 SKILL_LAB_CURSOR_KEY（发布版）或本地 CURSOR_API_KEY / LLM_API_KEY 后重启。"
        : "未配置 OpenAI 兼容 API Key。请设置 OPENAI_API_KEY / DEEPSEEK_API_KEY / LLM_API_KEY。";
    steps.push(step("execute", "执行", "error", "缺少 Provider Key。", { error: msg }));
    error = msg;
    status = "failed";
    return persist({
      runId,
      status,
      steps,
      finalAnswer,
      selectedSkill,
      provider,
      toolEvents,
      error,
      prompt,
      mode,
      explanation: buildExplanation({
        prompt,
        provider,
        mode,
        selectedSkill,
        why: steps.find((s) => s.id === "select")?.explanation || "",
        steps,
        toolEvents,
        finalAnswer: null,
      }),
    });
  }

  steps.push(
    step(
      "execute",
      "执行",
      "running",
      provider === "cursor"
        ? "后台执行 Cursor Agent（异步，避免网关 502）；请轮询运行状态。"
        : "后台执行 OpenAI 兼容 Agent（异步）；请轮询运行状态。",
      {
        provider,
        model: providerStatus.model,
        baseUrl: providerStatus.baseUrl,
        async: true,
      }
    )
  );

  // Persist "running" so the client can poll /api/runs/[runId] while Step8 finishes.
  return persist({
    runId,
    status: "running",
    steps,
    finalAnswer: null,
    selectedSkill,
    provider,
    toolEvents: [],
    prompt,
    mode,
  });
}

/**
 * Finish Step8 for a run left in status "running" by {@link runPipeline}.
 * Intended to run via next/server `after()` so the HTTP response can return first.
 */
export async function continuePipelineExecute(runId: string): Promise<void> {
  const { loadRunRecord, saveRunRecord } = await import("./runs");
  const record = await loadRunRecord(runId);
  if (!record || record.status !== "running") return;

  const steps = [...record.steps];
  const execIdx = steps.findIndex((s) => s.id === "execute");
  if (execIdx < 0 || steps[execIdx].status !== "running") return;

  const prior = (steps[execIdx].data || {}) as { claimedAt?: string };
  // already claimed by after() or an earlier poll-resume
  if (prior.claimedAt) return;

  // Claim the run so after() and poll-resume cannot double-start Step8.
  const claimData = {
    ...prior,
    claimedAt: new Date().toISOString(),
  };
  steps[execIdx] = {
    ...steps[execIdx],
    data: claimData,
    explanation: "Step8 已认领，正在执行 Agent…",
  };
  record.steps = steps;
  await saveRunRecord(record);

  const provider = record.provider;
  const providerStatus = getProviderStatus(provider, {
    model: (steps[execIdx].data as { model?: string } | undefined)?.model,
  });
  const selectedSkill = record.selectedSkill;
  if (!selectedSkill) {
    steps[execIdx] = step("execute", "执行", "error", "缺少 selectedSkill。");
    await persist({
      runId,
      status: "failed",
      steps,
      finalAnswer: null,
      selectedSkill: null,
      provider,
      toolEvents: [],
      error: "缺少 selectedSkill",
      prompt: record.prompt,
      mode: record.mode,
      createdAt: record.createdAt,
    });
    return;
  }

  const detail = await loadSkillDetail(selectedSkill);
  if (!detail) {
    steps[execIdx] = step(
      "execute",
      "执行",
      "error",
      `无法读取「${selectedSkill}」。`
    );
    await persist({
      runId,
      status: "failed",
      steps,
      finalAnswer: null,
      selectedSkill,
      provider,
      toolEvents: [],
      error: `无法加载 Skill「${selectedSkill}」。`,
      prompt: record.prompt,
      mode: record.mode,
      createdAt: record.createdAt,
    });
    return;
  }

  let finalAnswer: string | null = null;
  let toolEvents: ToolEvent[] = [];
  let error: string | undefined;

  try {
    if (provider === "cursor") {
      const result = await runCursorAgent({
        systemSkill: detail.body,
        userPrompt: record.prompt,
        model: providerStatus.model,
        skillHintPath: path.dirname(detail.absolutePath),
      });
      finalAnswer = result.finalAnswer;
      toolEvents = result.toolEvents;
      steps[execIdx] = step(
        "execute",
        "执行",
        "done",
        "Cursor Agent 多轮工具执行完成。",
        {
          provider: "cursor",
          iterations: result.iterations,
          toolCallCount: result.toolEvents.filter((e) => e.status === "completed")
            .length,
          contextLength: result.contextLength,
          responseLength: result.responseLength,
          toolEvents: result.toolEvents,
        }
      );
    } else {
      const result = await runOpenAICompatibleAgent({
        systemSkill: detail.body,
        userPrompt: record.prompt,
        baseUrl: providerStatus.baseUrl,
        model: providerStatus.model,
      });
      finalAnswer = result.finalAnswer;
      toolEvents = result.toolEvents;
      steps[execIdx] = step(
        "execute",
        "执行",
        "done",
        "OpenAI 兼容 Agent 多轮 tools 循环完成。",
        {
          provider: "openai",
          iterations: result.iterations,
          toolCallCount: result.toolEvents.filter((e) => e.status === "completed")
            .length,
          contextLength: result.contextLength,
          responseLength: result.responseLength,
          toolEvents: result.toolEvents,
        }
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error = msg;
    steps[execIdx] = step("execute", "执行", "error", "Agent 执行失败。", {
      error: msg,
    });
  }

  const explanation = buildExplanation({
    prompt: record.prompt,
    provider,
    mode: record.mode,
    selectedSkill,
    why: steps.find((s) => s.id === "select")?.explanation || "",
    steps,
    toolEvents,
    finalAnswer,
  });

  await persist({
    runId,
    status: error ? "failed" : "completed",
    steps,
    finalAnswer,
    selectedSkill,
    provider,
    toolEvents,
    explanation,
    error,
    prompt: record.prompt,
    mode: record.mode,
    createdAt: record.createdAt,
  });
}

function buildExplanation(input: {
  prompt: string;
  provider: string;
  mode: string;
  selectedSkill: string | null;
  why: string;
  steps: PipelineStep[];
  toolEvents: ToolEvent[];
  finalAnswer: string | null;
}): RunExplanation {
  const load = input.steps.find((s) => s.id === "load");
  const exec = input.steps.find((s) => s.id === "execute");
  const loadData = (load?.data || {}) as { files?: string[] };
  const execData = (exec?.data || {}) as {
    toolCallCount?: number;
    iterations?: number;
  };
  const checks: string[] = [];
  if (input.finalAnswer) checks.push("已返回最终文本回答");
  if ((execData.toolCallCount || 0) > 0) {
    checks.push(`观测到 ${execData.toolCallCount} 次已完成工具调用`);
  } else if (exec?.status === "done") {
    checks.push("执行完成但工具调用次数为 0（可能模型直接作答）");
  }
  const files = loadData.files || [];
  if (files.some((f) => f.includes("中译") || f.includes("prompts/"))) {
    checks.push("Skill 含 prompts 或中译相关文件结构");
  }
  if (input.selectedSkill === "english-blog-translate") {
    checks.push("期望产出：<domain>/<blog>.md 与 <domain>/中译-<blog>.md（视网络与脚本而定）");
  }

  return {
    task: input.prompt.slice(0, 200),
    provider: input.provider,
    mode: input.mode,
    finalSkill: input.selectedSkill,
    whySelected: input.why,
    step7Summary: load
      ? `${load.status}: 加载文件 ${files.length} 个`
      : "未加载",
    step8Summary: exec
      ? `${exec.status}: iterations=${execData.iterations ?? "—"}, tools=${execData.toolCallCount ?? 0}`
      : "未执行",
    resultChecks: checks,
  };
}

async function persist(input: {
  runId: string;
  status: RunResponse["status"];
  steps: PipelineStep[];
  finalAnswer: string | null;
  selectedSkill: string | null;
  provider: "cursor" | "openai";
  toolEvents: ToolEvent[];
  explanation?: RunExplanation;
  error?: string;
  prompt: string;
  mode: RunMode;
  createdAt?: string;
}): Promise<RunResponse> {
  const record: RunRecord = {
    runId: input.runId,
    status: input.status,
    steps: input.steps,
    finalAnswer: input.finalAnswer,
    selectedSkill: input.selectedSkill,
    provider: input.provider,
    toolEvents: input.toolEvents,
    explanation: input.explanation,
    error: input.error,
    prompt: input.prompt,
    mode: input.mode,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  await saveRunRecord(record);
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
