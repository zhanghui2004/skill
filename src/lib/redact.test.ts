import { describe, expect, it } from "vitest";
import {
  formatCursorAuthError,
  isHostSecretEnvKey,
  isSecretEnvKey,
  redactText,
  redactValue,
  scrubbedEnv,
  withScrubbedProcessEnv,
} from "./redact";

describe("redact", () => {
  it("scrubs common key shapes", () => {
    expect(redactText("Bearer abc.def")).toContain("[redacted]");
    expect(redactText("sk-abcdefghijklmnopqrstuvwxyz")).toContain("[redacted]");
    expect(redactText("crsr_abc123XYZ")).toContain("[redacted]");
    expect(redactText("OPENAI_API_KEY=secret-value-here")).toContain(
      "[redacted]"
    );
    expect(
      redactText("postgres://user:pass@db.example.com:5432/app")
    ).toContain("[redacted]");
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

  it("scrubbedEnv drops credential keys including DATABASE_URL", () => {
    const env = scrubbedEnv({
      PATH: "/usr/bin",
      HOME: "/home",
      NODE_ENV: "test",
      OPENAI_API_KEY: "x",
      SKILL_LAB_CURSOR_KEY: "y",
      DATABASE_URL: "postgres://u:p@h/db",
      DATABASE_URL_UNPOOLED: "postgres://u:p@h/db",
      POSTGRES_PASSWORD: "z",
      PGPASSWORD: "z",
      NEON_API_KEY: "n",
      AWS_SECRET_ACCESS_KEY: "a",
      CURSOR_API_KEY: "c",
      HTTP_PROXY: "http://proxy",
    } as NodeJS.ProcessEnv);
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home");
    expect(env.NODE_ENV).toBe("test");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.SKILL_LAB_CURSOR_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DATABASE_URL_UNPOOLED).toBeUndefined();
    expect(env.POSTGRES_PASSWORD).toBeUndefined();
    expect(env.PGPASSWORD).toBeUndefined();
    expect(env.NEON_API_KEY).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.CURSOR_API_KEY).toBeUndefined();
    expect(env.HTTP_PROXY).toBeUndefined();
  });

  it("isSecretEnvKey covers host DB and key prefixes", () => {
    expect(isSecretEnvKey("DATABASE_URL")).toBe(true);
    expect(isHostSecretEnvKey("DATABASE_URL")).toBe(true);
    expect(isHostSecretEnvKey("SKILL_LAB_CURSOR_KEY")).toBe(false);
    expect(isSecretEnvKey("PATH")).toBe(false);
    expect(isSecretEnvKey("HOME")).toBe(false);
  });

  it("withScrubbedProcessEnv reinjects CURSOR_API_KEY while keeping DATABASE_URL scrubbed", async () => {
    const dbKey = "DATABASE_URL";
    const prevDb = process.env[dbKey];
    const prevCursor = process.env.CURSOR_API_KEY;
    const prevSkill = process.env.SKILL_LAB_CURSOR_KEY;
    process.env[dbKey] = "postgres://restore-me";
    process.env.SKILL_LAB_CURSOR_KEY = "skill-lab-key";
    delete process.env.CURSOR_API_KEY;
    try {
      await withScrubbedProcessEnv(
        async () => {
          expect(process.env[dbKey]).toBeUndefined();
          expect(process.env.SKILL_LAB_CURSOR_KEY).toBeUndefined();
          expect(process.env.CURSOR_API_KEY).toBe("reinjected-key");
        },
        { reinject: { CURSOR_API_KEY: "reinjected-key" } }
      );
      expect(process.env[dbKey]).toBe("postgres://restore-me");
      expect(process.env.SKILL_LAB_CURSOR_KEY).toBe("skill-lab-key");
      expect(process.env.CURSOR_API_KEY).toBeUndefined();
    } finally {
      if (prevDb === undefined) delete process.env[dbKey];
      else process.env[dbKey] = prevDb;
      if (prevCursor === undefined) delete process.env.CURSOR_API_KEY;
      else process.env.CURSOR_API_KEY = prevCursor;
      if (prevSkill === undefined) delete process.env.SKILL_LAB_CURSOR_KEY;
      else process.env.SKILL_LAB_CURSOR_KEY = prevSkill;
    }
  });

  it("formatCursorAuthError maps unauthorized to Chinese guidance", () => {
    expect(formatCursorAuthError("unauthorized")).toMatch(/SKILL_LAB_CURSOR_KEY/);
    expect(formatCursorAuthError("HTTP 401")).toMatch(/无效或未授权/);
    expect(formatCursorAuthError("timeout")).toBeNull();
  });
});
