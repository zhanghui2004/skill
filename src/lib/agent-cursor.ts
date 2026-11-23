import path from "path";
import { Agent } from "@cursor/sdk";
import { getCursorKey, getMaxIterations } from "./providers";
import { getPackageRoot, getWritableRoot } from "./paths";
import { buildCursorUserMessage } from "./llm";
import { redactText, redactValue } from "./redact";
import type { ToolEvent } from "./types";

function pathResolveUnique(dirs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of dirs) {
    const r = path.resolve(d);
    if (seen.has(r)) continue;
    seen.add(r);
    out.push(r);
  }
  return out;
}

export interface CursorAgentResult {
  finalAnswer: string;
  toolEvents: ToolEvent[];
  iterations: number;
  contextLength: number;
  responseLength: number;
}

/**
 * Real Cursor Agent run with a constrained local toolset.
 * Skill instructions folded into user message — never systemPrompt.
 * Tool args/results returned to clients are redacted (same as OpenAI path).
 */
export async function runCursorAgent(options: {
  systemSkill: string;
  userPrompt: string;
  model: string;
  skillHintPath?: string;
}): Promise<CursorAgentResult> {
  const apiKey = getCursorKey();
  if (!apiKey) {
    throw new Error(
      "未配置 Cursor API Key。请设置 SKILL_LAB_CURSOR_KEY（发布版）或本地 CURSOR_API_KEY / LLM_API_KEY。"
    );
  }

  const cwd = getWritableRoot();
  const pkg = getPackageRoot();
  const guidance = [
    options.systemSkill,
    "",
    "执行要求：",
    "- 这是多轮工具任务：请实际读取 Skill 内 prompts/scripts，必要时运行 python 脚本。",
    "- 工作区根目录即当前 cwd（可写）；输出文件写到工作区内。",
    "- 打包的 Skill 可能在只读包目录；可读路径已加入 dirs。",
    "- 不要打印或回显任何 API Key / 环境变量 / Authorization 头。",
    "- 不要假装已经抓取网页；失败时说明错误。",
    options.skillHintPath
      ? `- 相关 Skill 目录：${options.skillHintPath}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const message = buildCursorUserMessage(guidance, options.userPrompt);
  const toolEvents: ToolEvent[] = [];
  let callCounter = 0;

  const dirs = pathResolveUnique([cwd, pkg]);

  const agent = await Agent.create({
    apiKey,
    model: { id: options.model },
    // Constrain built-ins: lab needs read/edit/shell for skill scripts, not web/MCP/subagents
    tools: ["shell", "read", "edit", "grep", "glob", "ls"],
    disallowedTools: [
      "webFetch",
      "webSearch",
      "mcp",
      "task",
      "generateImage",
      "applyAgentDiff",
      "askQuestion",
      "delete",
      "readLints",
      "semSearch",
    ],
    local: {
      cwd,
      // Writable cwd + package (skills) when they differ (hosted /tmp vs /var/task)
      dirs,
    },
  });

  try {
    const run = await agent.send(message);
    for await (const event of run.stream()) {
      if (event.type === "tool_call") {
        callCounter += 1;
        const rawArgs = (event as { args?: unknown }).args;
        const rawResult = (event as { result?: unknown }).result;
        toolEvents.push({
          callId: String(
            (event as { call_id?: string }).call_id || `cursor_${callCounter}`
          ),
          name: String((event as { name?: string }).name || "tool"),
          status:
            (event as { status?: string }).status === "completed"
              ? "completed"
              : (event as { status?: string }).status === "error"
                ? "error"
                : "started",
          args: redactValue(rawArgs) as ToolEvent["args"],
          result: redactValue(rawResult),
          timestamp: Date.now(),
        });
      }
    }

    const result = await run.wait();
    if (result.status === "error") {
      const raw = result.error?.message || "未知错误";
      if (/Custom system prompt is not enabled|system prompt/i.test(raw)) {
        throw new Error(
          "当前 Cursor 账号未开通自定义 system prompt。本实验室已避免使用 systemPrompt；请更新代码后重试。也可改用 OpenAI-compatible Provider。"
        );
      }
      throw new Error(`Cursor SDK 运行失败：${redactText(raw)}`);
    }

    const finalAnswerRaw =
      typeof result.result === "string" && result.result.trim()
        ? result.result
        : "（Cursor Agent 未返回文本结果，请检查工具产物文件）";
    const finalAnswer = redactText(finalAnswerRaw);

    return {
      finalAnswer,
      toolEvents,
      iterations: Math.max(1, toolEvents.length || 1),
      contextLength: message.length,
      responseLength: finalAnswer.length,
    };
  } finally {
    try {
      await agent.close?.();
    } catch {
      // ignore
    }
  }
}

// Keep max iterations env visible for UI even though Cursor manages its own loop
export function cursorMaxIterationsHint(): number {
  return getMaxIterations();
}
