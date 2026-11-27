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

/** Host / app secret env keys that must never reach agent child processes. */
export function isSecretEnvKey(key: string): boolean {
  if (
    /^(DATABASE_URL|DATABASE_URL_UNPOOLED)$/i.test(key) ||
    /^(POSTGRES|PG|NEON)_/i.test(key) ||
    /^(SKILL_LAB_|OPENAI_|DEEPSEEK_|LLM_|CURSOR_|AWS_|VERCEL|LAMBDA_|NOW_)/i.test(
      key
    ) ||
    /^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NODE_TLS)/i.test(key) ||
    /CONNECTION[_-]?STRING/i.test(key)
  ) {
    return true;
  }
  return /API[_-]?KEY|SECRET|TOKEN|PASSWORD|AUTHORIZATION|CREDENTIAL|PRIVATE[_-]?KEY/i.test(
    key
  );
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
      if (isSecretEnvKey(k) || /api[_-]?key|authorization|secret|token|password/i.test(k)) {
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
 * Child-process env without host credentials.
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

/**
 * Temporarily remove secret keys from `process.env` while `fn` runs, then restore.
 * Used so Cursor SDK shell children (which inherit process.env) cannot read host secrets.
 */
export async function withScrubbedProcessEnv<T>(
  fn: () => Promise<T>
): Promise<T> {
  const removed: Array<[string, string]> = [];
  for (const k of Object.keys(process.env)) {
    if (!isSecretEnvKey(k)) continue;
    const v = process.env[k];
    if (v === undefined) continue;
    removed.push([k, v]);
    delete process.env[k];
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of removed) {
      process.env[k] = v;
    }
  }
}
