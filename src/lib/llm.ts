import { Agent } from "@cursor/sdk";

export type LlmProvider = "cursor" | "openai";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string | null;
  /** Display / OpenAI-compat base URL. For Cursor SDK this is informational. */
  baseUrl: string;
  model: string;
  missingKeyMessage: string;
}

const CURSOR_DEFAULT_MODEL = "composer-2.5";
const CURSOR_DOCS_BASE = "https://api.cursor.com";
const OPENAI_FALLBACK_BASE = "https://api.deepseek.com/v1";
const OPENAI_FALLBACK_MODEL = "deepseek-chat";

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

/**
 * Cursor has no public OpenAI-compatible /v1/chat/completions for personal keys.
 * Default path: @cursor/sdk Agent.prompt
 * (SKILL_LAB_CURSOR_KEY → local CURSOR_API_KEY → LLM_API_KEY).
 * Optional fallback: OpenAI-compatible HTTP (e.g. DeepSeek).
 *
 * Important: do NOT pass `systemPrompt` — many accounts get
 * "Custom system prompt is not enabled". Skill text is folded into the user message.
 */
export function getLlmConfig(): LlmConfig {
  const explicit = env("AI_PROVIDER")?.toLowerCase();
  const cursorKey =
    env("SKILL_LAB_CURSOR_KEY") ||
    env("CURSOR_API_KEY") ||
    undefined;
  const llmKey = env("LLM_API_KEY") || undefined;
  const deepseekKey = env("DEEPSEEK_API_KEY") || undefined;

  let provider: LlmProvider;
  if (explicit === "openai" || explicit === "open-ai") {
    provider = "openai";
  } else if (explicit === "cursor") {
    provider = "cursor";
  } else if (cursorKey) {
    provider = "cursor";
  } else if (deepseekKey && !llmKey) {
    provider = "openai";
  } else {
    // Default: Cursor (LLM_API_KEY is treated as Cursor alias)
    provider = "cursor";
  }

  if (provider === "cursor") {
    const apiKey = cursorKey || llmKey || null;
    return {
      provider: "cursor",
      apiKey,
      baseUrl: env("AI_BASE_URL") || CURSOR_DOCS_BASE,
      model: env("AI_MODEL") || CURSOR_DEFAULT_MODEL,
      missingKeyMessage:
        "未配置 Cursor API Key。请设置 SKILL_LAB_CURSOR_KEY（发布版）或本地 CURSOR_API_KEY / LLM_API_KEY 后重启。可在 Cursor Dashboard → API Keys 创建：https://cursor.com/dashboard",
    };
  }

  const apiKey = deepseekKey || llmKey || null;
  return {
    provider: "openai",
    apiKey,
    baseUrl: env("AI_BASE_URL") || OPENAI_FALLBACK_BASE,
    model: env("AI_MODEL") || OPENAI_FALLBACK_MODEL,
    missingKeyMessage:
      "未配置 OpenAI 兼容 API Key。请设置 DEEPSEEK_API_KEY 或 LLM_API_KEY，并确认 AI_PROVIDER=openai。",
  };
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly code: "missing_key" | "http_error" | "parse_error"
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** Fold Skill / system instructions into the user turn (no custom systemPrompt). */
export function buildCursorUserMessage(system: string | undefined, user: string): string {
  if (!system?.trim()) return user;
  return [
    "请严格按下面的 Skill 说明完成任务，然后直接给出最终回答。",
    "",
    "===== Skill 说明开始 =====",
    system.trim(),
    "===== Skill 说明结束 =====",
    "",
    "===== 用户请求 =====",
    user,
  ].join("\n");
}

function chineseCursorError(raw: string): string {
  if (/Custom system prompt is not enabled|system prompt/i.test(raw)) {
    return "当前 Cursor 账号未开通自定义 system prompt。本应用已改为把 Skill 写入用户消息；请更新到最新代码后重试。若仍失败，可在 .env.local 设置 AI_PROVIDER=openai 并配置 DEEPSEEK_API_KEY 作为回退。";
  }
  return `Cursor SDK 运行失败：${raw}`;
}

async function chatViaCursorSdk(options: {
  system?: string;
  user: string;
  apiKey: string;
  model: string;
}): Promise<string> {
  // Never pass systemPrompt — not enabled on many accounts.
  const message = buildCursorUserMessage(options.system, options.user);

  try {
    const result = await Agent.prompt(message, {
      apiKey: options.apiKey,
      model: { id: options.model },
      tools: [],
      local: {
        // Isolated scratch cwd — do not touch ~/.cursor/skills-cursor
        cwd: process.cwd(),
      },
    });

    if (result.status === "error") {
      const raw = result.error?.message || "未知错误";
      throw new LlmError(chineseCursorError(raw), "http_error");
    }
    if (typeof result.result !== "string" || !result.result.trim()) {
      throw new LlmError("Cursor SDK 返回内容为空", "parse_error");
    }
    return result.result;
  } catch (err) {
    if (err instanceof LlmError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new LlmError(chineseCursorError(msg), "http_error");
  }
}

async function chatViaOpenAICompat(options: {
  system?: string;
  user: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
}): Promise<string> {
  const url = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const messages: Array<{ role: string; content: string }> = [];
  if (options.system) {
    messages.push({ role: "system", content: options.system });
  }
  messages.push({ role: "user", content: options.user });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LlmError(
      `LLM 请求失败（HTTP ${res.status}）：${text.slice(0, 400) || res.statusText}`,
      "http_error"
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LlmError("LLM 返回内容为空或格式异常", "parse_error");
  }
  return content;
}

export async function chatCompletion(options: {
  system?: string;
  user: string;
  temperature?: number;
}): Promise<string> {
  const config = getLlmConfig();
  if (!config.apiKey) {
    throw new LlmError(config.missingKeyMessage, "missing_key");
  }

  if (config.provider === "cursor") {
    return chatViaCursorSdk({
      system: options.system,
      user: options.user,
      apiKey: config.apiKey,
      model: config.model,
    });
  }

  return chatViaOpenAICompat({
    system: options.system,
    user: options.user,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: options.temperature,
  });
}
