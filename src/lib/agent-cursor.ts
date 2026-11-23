import { Agent } from "@cursor/sdk";
import { getCursorKey, getMaxIterations } from "./providers";
import { getProjectRoot } from "./paths";
import { buildCursorUserMessage } from "./llm";
import type { ToolEvent } from "./types";

export interface CursorAgentResult {
  finalAnswer: string;
  toolEvents: ToolEvent[];
  iterations: number;
  contextLength: number;
  responseLength: number;
}

/**
 * Real Cursor Agent run with tools enabled (not tools: []).
 * Skill instructions folded into user message — never systemPrompt.
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

  const cwd = getProjectRoot();
  const guidance = [
    options.systemSkill,
    "",
    "执行要求：",
    "- 这是多轮工具任务：请实际读取 Skill 内 prompts/scripts，必要时运行 python 脚本。",
    "- 工作区根目录即当前 cwd；输出文件写到工作区内。",
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

  const agent = await Agent.create({
    apiKey,
    model: { id: options.model },
    // Enable default local tools (read/shell/edit…) — NOT tools: []
    local: {
      cwd,
      // Extra dirs help skill discovery in multi-root setups
      dirs: [cwd],
    },
  });

  try {
    const run = await agent.send(message);
    for await (const event of run.stream()) {
      if (event.type === "tool_call") {
        callCounter += 1;
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
          args: (event as { args?: unknown }).args,
          result: (event as { result?: unknown }).result,
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
      throw new Error(`Cursor SDK 运行失败：${raw}`);
    }

    const finalAnswer =
      typeof result.result === "string" && result.result.trim()
        ? result.result
        : "（Cursor Agent 未返回文本结果，请检查工具产物文件）";

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
