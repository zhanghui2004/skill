/**
 * Shared secret scrubbing for tool outputs shown to clients / persisted runs.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{10,}/g,
  /crsr_[a-zA-Z0-9]+/g,
  /Bearer\s+[^\s]+/gi,
  /(?<=(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|AUTHORIZATION)\s*[:=]\s*)["']?[^\s"'\\]+/gi,
  /(?<=(?:SKILL_LAB_CURSOR_KEY|OPENAI_API_KEY|DEEPSEEK_API_KEY|LLM_API_KEY|CURSOR_API_KEY)\s*[:=]\s*)["']?[^\s"'\\]+/gi,
];

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
      if (/api[_-]?key|authorization|secret|token|password/i.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Child-process env without credential-like keys (OpenAI run_terminal / Cursor). */
export function scrubbedEnv(
  source: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const child: NodeJS.ProcessEnv = { ...source };
  for (const k of Object.keys(child)) {
    if (
      /API_KEY|SECRET|TOKEN|PASSWORD|AUTHORIZATION|SKILL_LAB_CURSOR/i.test(k)
    ) {
      delete child[k];
    }
  }
  return child;
}
