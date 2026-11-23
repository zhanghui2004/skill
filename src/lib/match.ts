import type { MatchCandidate, MatchResult, SkillMetadata, SkillScope } from "./types";

const TRIGGER_LEXICON: Array<{ term: string; skills: string[]; weight: number }> = [
  { term: "翻译", skills: ["translate", "english-blog-translate"], weight: 3 },
  { term: "translate", skills: ["translate", "english-blog-translate"], weight: 3 },
  { term: "英译", skills: ["translate", "english-blog-translate"], weight: 2 },
  { term: "中译", skills: ["translate", "english-blog-translate"], weight: 2 },
  { term: "英文博客", skills: ["english-blog-translate"], weight: 5 },
  { term: "博客", skills: ["english-blog-translate"], weight: 3 },
  { term: "blog", skills: ["english-blog-translate"], weight: 4 },
  { term: "url", skills: ["english-blog-translate", "translate"], weight: 2 },
  { term: "归档", skills: ["english-blog-translate"], weight: 2 },
  { term: "保存", skills: ["english-blog-translate"], weight: 1 },
  { term: "摘要", skills: ["summarize"], weight: 4 },
  { term: "总结", skills: ["summarize"], weight: 3 },
  { term: "概括", skills: ["summarize"], weight: 3 },
  { term: "summarize", skills: ["summarize"], weight: 4 },
  { term: "会议", skills: ["meeting-notes"], weight: 4 },
  { term: "纪要", skills: ["meeting-notes"], weight: 4 },
  { term: "议程", skills: ["meeting-notes"], weight: 2 },
  { term: "决议", skills: ["meeting-notes"], weight: 2 },
  { term: "action item", skills: ["meeting-notes"], weight: 3 },
  { term: "meeting", skills: ["meeting-notes"], weight: 3 },
];

const URL_RE = /https?:\/\/[^\s)]+/i;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s，。、；：,.!！？?()（）\[\]【】"'“”‘’/\\|_+*=<>{}]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreOne(
  prompt: string,
  skill: Pick<
    SkillMetadata,
    "name" | "description" | "scope" | "disableModelInvocation"
  >
): MatchCandidate {
  const lower = prompt.toLowerCase();
  const matchedTerms: string[] = [];
  let score = 0;

  // Trigger lexicon
  for (const entry of TRIGGER_LEXICON) {
    if (lower.includes(entry.term.toLowerCase()) && entry.skills.includes(skill.name)) {
      score += entry.weight;
      if (!matchedTerms.includes(entry.term)) matchedTerms.push(entry.term);
    }
  }

  // Token overlap with description
  const promptTokens = new Set(tokenize(prompt));
  const descTokens = tokenize(skill.description);
  let overlap = 0;
  for (const t of descTokens) {
    if (promptTokens.has(t)) {
      overlap += 1;
      if (!matchedTerms.includes(t) && matchedTerms.length < 12) matchedTerms.push(t);
    }
  }
  score += overlap * 0.75;

  // Name exact-ish
  if (lower.includes(skill.name.toLowerCase())) {
    score += 2;
    matchedTerms.push(skill.name);
  }

  // URL / blog intent boosts english-blog-translate; plain 翻译 without URL prefers translate
  const urlHit = URL_RE.test(prompt);
  const blogIntent =
    /博客|blog|归档|waitbutwhy|文章\s*url|网页/i.test(prompt) || urlHit;

  if (skill.name === "english-blog-translate") {
    if (blogIntent) {
      score += urlHit ? 6 : 4;
      if (urlHit && !matchedTerms.includes("url")) matchedTerms.push("url");
    } else {
      // Demote blog skill for plain bilingual translation sentences
      score *= 0.35;
    }
  } else if (skill.name === "translate" && urlHit) {
    score += 1.5;
    if (!matchedTerms.includes("url")) matchedTerms.push("url");
  }

  return {
    name: skill.name,
    scope: skill.scope as SkillScope,
    score: Math.round(score * 10) / 10,
    matchedTerms,
    reason:
      score > 0
        ? `启发式得分 ${score.toFixed(1)}；命中：${matchedTerms.slice(0, 6).join("、") || "—"}`
        : "无明显命中",
    disableModelInvocation: skill.disableModelInvocation,
  };
}

export function hasUrl(prompt: string): boolean {
  return URL_RE.test(prompt);
}

export function extractUrl(prompt: string): string | null {
  const m = prompt.match(URL_RE);
  return m ? m[0] : null;
}

/**
 * Explainable heuristic matcher (Gap D).
 * Auto pool excludes disableModelInvocation skills.
 */
export function matchByHeuristic(
  prompt: string,
  skills: Array<
    Pick<
      SkillMetadata,
      "name" | "description" | "scope" | "disableModelInvocation"
    >
  >,
  options?: { forcedSkill?: string }
): MatchResult {
  const allScored = skills
    .map((s) => scoreOne(prompt, s))
    .sort((a, b) => b.score - a.score);

  if (options?.forcedSkill) {
    return {
      selected: options.forcedSkill,
      reason: "实验室指定",
      candidates: allScored,
      method: "manual",
    };
  }

  const pool = allScored.filter((c) => !c.disableModelInvocation);
  const top = pool[0];
  if (!top || top.score <= 0) {
    return {
      selected: null,
      reason: "没有匹配的 skill",
      candidates: allScored,
      method: "heuristic",
      error: "没有匹配的 skill",
    };
  }

  return {
    selected: top.name,
    reason: `Auto 选择最高分「${top.name}」（${top.score}）：${top.reason}`,
    candidates: allScored,
    method: "heuristic",
  };
}

/** @deprecated use matchByHeuristic — kept for old tests */
export function matchByKeywords(
  prompt: string,
  skills: Array<Pick<SkillMetadata, "name" | "description">>
): MatchResult {
  return matchByHeuristic(
    prompt,
    skills.map((s) => ({
      ...s,
      scope: "project" as SkillScope,
      disableModelInvocation: false,
    }))
  );
}

export async function matchSkill(
  prompt: string,
  skills: Array<
    Pick<
      SkillMetadata,
      "name" | "description" | "scope" | "disableModelInvocation"
    >
  >
): Promise<MatchResult> {
  return matchByHeuristic(prompt, skills);
}
