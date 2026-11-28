/**
 * Shared secret scrubbing for tool outputs shown to clients / persisted runs,
 * and for child-process environments (OpenAI run_terminal / Cursor shell).
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{10,}/g,
  /crsr_[a-zA-Z0-9]+/g,
  /Bearer\s+[^\s]+/gi,
  /(?<=(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|AUTHORIZATION)\s*[:=]\s*)["']?[^\s"'\\]+/gi,
  /(?<=(?:SKILL_LAB_CURSOR_KEY|OPENAI_API_KEY|DEEPSEEK_API_KEY|LLM_API_KEY|CURSOR_API_KEY|DATABASE_URL(?:_UNPOOLED)?)\s*[:=]\s*)["']?[^\s"'\\]+/gi,
  /postgres(?:ql)?:\/\/[^\s"'\\]+/gi,
];

/** Postgres / cloud host secrets — never needed by agent child processes. */
export function isHostSecretEnvKey(key: string): boolean {
  return (
    /^(DATABASE_URL|DATABASE_URL_UNPOOLED)$/i.test(key) ||
    /^(POSTGRES|PG|NEON)_/i.test(key) ||
    /^(AWS_|VERCEL|LAMBDA_|NOW_)/i.test(key) ||
    /^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NODE_TLS)/i.test(key) ||
    /CONNECTION[_-]?STRING/i.test(key)
  );
}

/** Provider API credentials (Cursor / OpenAI / etc.). */
export function isProviderCredentialEnvKey(key: string): boolean {
  if (/^(SKILL_LAB_|OPENAI_|DEEPSEEK_|LLM_|CURSOR_)/i.test(key)) return true;
  return /API[_-]?KEY|SECRET|TOKEN|PASSWORD|AUTHORIZATION|CREDENTIAL|PRIVATE[_-]?KEY/i.test(
    key
  );
}

/** Host / app secret env keys that must never reach OpenAI run_terminal children. */
export function isSecretEnvKey(key: string): boolean {
  return isHostSecretEnvKey(key) || isProviderCredentialEnvKey(key);
}

export function redactText(s: string): string {
  let out = s;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "[redacted]");
  }
  return out;
}

/** Deep-redact strings in JSON-like tool args/results for client responses. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") {
    const redacted = redactText(value);
    return redacted.length > 20000
      ? redacted.slice(0, 20000) + "\n…[truncated]"
      : redacted;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((v) => redactValue(v, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (
        isSecretEnvKey(k) ||
        /api[_-]?key|authorization|secret|token|password/i.test(k)
      ) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Child-process env without host credentials (OpenAI run_terminal).
 * Drops DATABASE_URL / API keys / cloud reserved prefixes while keeping PATH/HOME/etc.
 */
export function scrubbedEnv(
  source: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const child: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) {
    if (v === undefined) continue;
    if (isSecretEnvKey(k)) continue;
    child[k] = v;
  }
  return child;
}

export type ScrubProcessEnvOptions = {
  /**
   * After scrubbing, set these on process.env for the duration of `fn`.
   * Use to reinject Cursor SDK auth (`CURSOR_API_KEY`) without leaving
   * DATABASE_URL visible to shell children.
   */
  reinject?: Record<string, string>;
  /** When true (default), also strip provider API key env vars. */
  scrubProviderCredentials?: boolean;
};

/**
 * Temporarily remove secret keys from `process.env` while `fn` runs, then restore.
 * Cursor SDK local runtime may read CURSOR_API_KEY from env — pass it via `reinject`
 * after scrub so auth still works while DATABASE_URL stays removed.
 */
export async function withScrubbedProcessEnv<T>(
  fn: () => Promise<T>,
  options: ScrubProcessEnvOptions = {}
): Promise<T> {
  const scrubProvider = options.scrubProviderCredentials !== false;
  const removed: Array<[string, string]> = [];
  for (const k of Object.keys(process.env)) {
    const drop = scrubProvider
      ? isSecretEnvKey(k)
      : isHostSecretEnvKey(k);
    if (!drop) continue;
    const v = process.env[k];
    if (v === undefined) continue;
    removed.push([k, v]);
    delete process.env[k];
  }

  const reinject = options.reinject ?? {};
  const injectedKeys: string[] = [];
  for (const [k, v] of Object.entries(reinject)) {
    if (!v) continue;
    process.env[k] = v;
    injectedKeys.push(k);
  }

  try {
    return await fn();
  } finally {
    for (const k of injectedKeys) {
      delete process.env[k];
    }
    for (const [k, v] of removed) {
      process.env[k] = v;
    }
  }
}

/** Map Cursor SDK auth failures to a clear Chinese message for the lab UI. */
export function formatCursorAuthError(raw: string): string | null {
  if (
    /unauthorized|unauthenticated|invalid api key|invalid.?key|401|403|sign_in_required|api key is required/i.test(
      raw
    )
  ) {
    return "Cursor API Key 无效或未授权。请在 Cursor Secrets 中检查 SKILL_LAB_CURSOR_KEY 是否有效，并重新发布/绑定后重试。";
  }
  return null;
}
