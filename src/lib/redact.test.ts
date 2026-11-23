import { describe, expect, it } from "vitest";
import { redactText, redactValue, scrubbedEnv } from "./redact";

describe("redact", () => {
  it("scrubs common key shapes", () => {
    expect(redactText("Bearer abc.def")).toContain("[redacted]");
    expect(redactText("sk-abcdefghijklmnopqrstuvwxyz")).toContain("[redacted]");
    expect(redactText("crsr_abc123XYZ")).toContain("[redacted]");
    expect(redactText("OPENAI_API_KEY=secret-value-here")).toContain(
      "[redacted]"
    );
  });

  it("redacts nested tool payloads", () => {
    const v = redactValue({
      apiKey: "should-go",
      output: "Bearer tokentoken",
      nested: { text: "sk-abcdefghijklmnopqrstuvwxyz" },
    }) as Record<string, unknown>;
    expect(v.apiKey).toBe("[redacted]");
    expect(String(v.output)).toContain("[redacted]");
    expect(String((v.nested as { text: string }).text)).toContain("[redacted]");
  });

  it("scrubbedEnv drops credential keys", () => {
    const env = scrubbedEnv({
      PATH: "/usr/bin",
      OPENAI_API_KEY: "x",
      SKILL_LAB_CURSOR_KEY: "y",
      HOME: "/home",
    });
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.SKILL_LAB_CURSOR_KEY).toBeUndefined();
  });
});
