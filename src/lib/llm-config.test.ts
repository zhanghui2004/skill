import { afterEach, describe, expect, it } from "vitest";
import {
  getCursorKey,
  getOpenAICompatKey,
  getProviderStatus,
  resolveProvider,
} from "./providers";

const KEYS = [
  "SKILL_LAB_CURSOR_KEY",
  "CURSOR_API_KEY",
  "LLM_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "AI_PROVIDER",
  "AI_BASE_URL",
  "AI_MODEL",
  "RUN_PROVIDER",
] as const;

const snapshot: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

function clearAll() {
  for (const k of KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
}

afterEach(() => {
  for (const k of KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

describe("providers", () => {
  it("defaults resolve to cursor when no keys", () => {
    clearAll();
    expect(resolveProvider("auto")).toBe("cursor");
    expect(getProviderStatus("cursor").model).toBe("composer-2.5");
    expect(getProviderStatus("cursor").hasApiKey).toBe(false);
  });

  it("prefers SKILL_LAB_CURSOR_KEY over local CURSOR_API_KEY", () => {
    clearAll();
    process.env.SKILL_LAB_CURSOR_KEY = "published-key";
    process.env.CURSOR_API_KEY = "local-key";
    expect(getCursorKey()).toBe("published-key");
    expect(resolveProvider("auto")).toBe("cursor");
    expect(getProviderStatus("cursor").hasApiKey).toBe(true);
  });

  it("falls back to CURSOR_API_KEY for cursor", () => {
    clearAll();
    process.env.CURSOR_API_KEY = "cursor-test";
    expect(getCursorKey()).toBe("cursor-test");
    expect(resolveProvider("auto")).toBe("cursor");
    expect(getProviderStatus("cursor").hasApiKey).toBe(true);
  });

  it("openai status uses OPENAI/DEEPSEEK keys", () => {
    clearAll();
    process.env.DEEPSEEK_API_KEY = "ds-key";
    expect(getOpenAICompatKey()).toBe("ds-key");
    expect(resolveProvider("auto")).toBe("openai");
    expect(getProviderStatus("openai").hasApiKey).toBe(true);
  });

  it("respects RUN_PROVIDER=openai", () => {
    clearAll();
    process.env.CURSOR_API_KEY = "c";
    process.env.RUN_PROVIDER = "openai";
    expect(resolveProvider("auto")).toBe("openai");
  });
});
