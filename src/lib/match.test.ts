import { describe, expect, it } from "vitest";
import { matchByHeuristic, matchByKeywords } from "./match";

const skills = [
  {
    name: "translate",
    description:
      "中英文互译助手。当用户要求翻译、英译中、中译英、translate、或把某段话翻译成英文/中文时使用。",
    scope: "project" as const,
    disableModelInvocation: false,
  },
  {
    name: "summarize",
    description:
      "结构化摘要助手。当用户要求总结、摘要、概括、提炼要点、summarize、或把长文压缩成要点时使用。",
    scope: "project" as const,
    disableModelInvocation: false,
  },
  {
    name: "meeting-notes",
    description:
      "会议纪要助手。当用户要求整理会议记录、议程、决议、待办、action items、meeting notes、或从会议文本提炼决策与行动项时使用。",
    scope: "project" as const,
    disableModelInvocation: false,
  },
  {
    name: "english-blog-translate",
    description:
      "翻译英文博客助手。当用户要求翻译英文博客、blog、给出文章 URL、抓取网页并保存/归档中文译文时使用。",
    scope: "project" as const,
    disableModelInvocation: false,
  },
];

describe("matchByHeuristic", () => {
  it("matches Chinese translation prompts to translate", () => {
    const result = matchByHeuristic(
      "请把下面这段话翻译成英文：渐进式披露很重要。",
      skills
    );
    expect(result.selected).toBe("translate");
    expect(result.method).toBe("heuristic");
  });

  it("ranks english-blog-translate highest for blog URL prompt", () => {
    const result = matchByHeuristic(
      "翻译 https://waitbutwhy.com/2023/05/baby.html",
      skills
    );
    expect(result.selected).toBe("english-blog-translate");
    const top = result.candidates[0];
    expect(top.name).toBe("english-blog-translate");
    expect(
      top.matchedTerms.some((t) => t === "翻译" || t === "url" || t === "blog")
    ).toBe(true);
  });

  it("matches summarize prompts", () => {
    const result = matchByHeuristic("请总结一下下面这篇文章的要点", skills);
    expect(result.selected).toBe("summarize");
  });

  it("matches meeting notes prompts", () => {
    const result = matchByHeuristic(
      "帮我整理这份会议纪要，列出决议和 action items",
      skills
    );
    expect(result.selected).toBe("meeting-notes");
  });

  it("returns 没有匹配的 skill when all zero", () => {
    const result = matchByHeuristic("今天天气怎么样？", skills);
    expect(result.selected).toBeNull();
    expect(result.error).toBe("没有匹配的 skill");
  });

  it("force mode uses 实验室指定 but still scores", () => {
    const result = matchByHeuristic(
      "翻译 https://waitbutwhy.com/2023/05/baby.html",
      skills,
      { forcedSkill: "summarize" }
    );
    expect(result.selected).toBe("summarize");
    expect(result.reason).toBe("实验室指定");
    expect(result.candidates[0].name).toBe("english-blog-translate");
  });

  it("excludes disableModelInvocation from auto pool", () => {
    const withDisabled = skills.map((s) =>
      s.name === "english-blog-translate"
        ? { ...s, disableModelInvocation: true }
        : s
    );
    const result = matchByHeuristic(
      "翻译 https://waitbutwhy.com/2023/05/baby.html",
      withDisabled
    );
    expect(result.selected).not.toBe("english-blog-translate");
  });
});

describe("matchByKeywords compat", () => {
  it("still works for old translate case", () => {
    const result = matchByKeywords("请翻译成英文：hello", [
      { name: "translate", description: skills[0].description },
      { name: "summarize", description: skills[1].description },
    ]);
    expect(result.selected).toBe("translate");
  });
});
