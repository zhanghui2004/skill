import { describe, expect, it } from "vitest";
import {
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
    expect(isSecretEnvKey("PATH")).toBe(false);
    expect(isSecretEnvKey("HOME")).toBe(false);
  });

  it("withScrubbedProcessEnv restores secrets after the callback", async () => {
    const key = "DATABASE_URL";
    const prev = process.env[key];
    process.env[key] = "postgres://restore-me";
    try {
      await withScrubbedProcessEnv(async () => {
        expect(process.env[key]).toBeUndefined();
      });
      expect(process.env[key]).toBe("postgres://restore-me");
    } finally {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  });
});
