import { describe, expect, it } from "vitest";
import { buildCursorUserMessage } from "./llm";

describe("buildCursorUserMessage", () => {
  it("returns user text when no system skill", () => {
    expect(buildCursorUserMessage(undefined, "你好")).toBe("你好");
    expect(buildCursorUserMessage("  ", "你好")).toBe("你好");
  });

  it("folds skill body into the user message without using systemPrompt", () => {
    const msg = buildCursorUserMessage(
      "# 翻译 Skill\n保持原意。",
      "请翻译：渐进式披露"
    );
    expect(msg).toContain("Skill 说明");
    expect(msg).toContain("# 翻译 Skill");
    expect(msg).toContain("请翻译：渐进式披露");
    expect(msg).not.toMatch(/systemPrompt/i);
  });
});
