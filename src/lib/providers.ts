import type { ProviderStatus, RunProvider } from "./types";

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

/**
 * Published apps bind SKILL_LAB_CURSOR_KEY (CURSOR_* is reserved by the host).
 * Local fallbacks: CURSOR_API_KEY then LLM_API_KEY.
 */
export function getCursorKey(): string | null {
  return (
    env("SKILL_LAB_CURSOR_KEY") ||
    env("CURSOR_API_KEY") ||
    env("LLM_API_KEY") ||
    null
  );
}

export function getOpenAICompatKey(): string | null {
  return (
    env("OPENAI_API_KEY") ||
    env("DEEPSEEK_API_KEY") ||
    env("LLM_API_KEY") ||
    null
  );
}

export function resolveProvider(
  requested: RunProvider | undefined
): "cursor" | "openai" {
  const raw = (requested ?? env("RUN_PROVIDER") ?? "auto").toLowerCase();
  if (raw === "cursor") return "cursor";
  if (raw === "openai" || raw === "compatible") return "openai";

  // auto (also when requested === "auto"): prefer env RUN_PROVIDER if set to a concrete provider
  const fromEnv = (env("RUN_PROVIDER") || "auto").toLowerCase();
  if (fromEnv === "cursor") return "cursor";
  if (fromEnv === "openai" || fromEnv === "compatible") return "openai";

  if (getCursorKey()) return "cursor";
  if (getOpenAICompatKey()) return "openai";
  return "cursor";
}

export function getProviderStatus(
  provider: "cursor" | "openai",
  overrides?: { baseUrl?: string; model?: string }
): ProviderStatus {
  const envModel = env("AI_MODEL");
  const envBase = env("AI_BASE_URL");

  if (provider === "cursor") {
    return {
      provider: "cursor",
      hasApiKey: Boolean(getCursorKey()),
      baseUrl: overrides?.baseUrl || "https://api.cursor.com",
      model: overrides?.model || envModel || "composer-2.5",
      label: "Cursor Agent",
    };
  }

  // Prefer OpenAI-compatible defaults unless env clearly points at a gateway
  const baseUrl =
    overrides?.baseUrl ||
    envBase ||
    "https://api.openai.com/v1";
  const model =
    overrides?.model ||
    (envModel && !/^composer/i.test(envModel) ? envModel : undefined) ||
    "gpt-4.1-mini";

  return {
    provider: "openai",
    hasApiKey: Boolean(getOpenAICompatKey()),
    baseUrl,
    model,
    label: "OpenAI-compatible Agent",
  };
}

export function listProviderStatuses(): ProviderStatus[] {
  return [getProviderStatus("cursor"), getProviderStatus("openai")];
}

export function getMaxIterations(): number {
  const n = Number(env("AGENT_MAX_ITERATIONS") || "25");
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 25;
}
