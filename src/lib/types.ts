export type StepStatus = "waiting" | "running" | "done" | "skipped" | "error";

export type SkillScope = "project" | "agents" | "user";

export type RunProvider = "cursor" | "openai" | "auto";

export type RunMode = "auto" | "manual";

export interface PipelineStep {
  id: string;
  title: string;
  status: StepStatus;
  explanation: string;
  data?: unknown;
  teachNote?: TeachNote;
}

export interface TeachNote {
  做什么: string;
  Cursor真实行为: string;
  实验室如何展示: string;
  要点: string[];
}

export interface SkillMetadata {
  name: string;
  description: string;
  path: string;
  folder: string;
  absolutePath: string;
  scope: SkillScope;
  lines: number;
  disableModelInvocation: boolean;
  valid: boolean;
  validationErrors: string[];
}

export interface SkillDetail extends SkillMetadata {
  body: string;
  raw: string;
  frontmatter: Record<string, unknown>;
  files: SkillTreeNode[];
}

export interface SkillTreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: SkillTreeNode[];
}

export interface MatchCandidate {
  name: string;
  scope: SkillScope;
  score: number;
  matchedTerms: string[];
  reason: string;
  disableModelInvocation: boolean;
}

export interface MatchResult {
  selected: string | null;
  reason: string;
  candidates: MatchCandidate[];
  method: "heuristic" | "manual" | "none";
  error?: string;
}

export interface ToolEvent {
  callId: string;
  name: string;
  status: "started" | "completed" | "error";
  args?: unknown;
  result?: unknown;
  timestamp?: number;
}

export interface ProviderStatus {
  provider: "cursor" | "openai";
  hasApiKey: boolean;
  baseUrl: string;
  model: string;
  label: string;
}

export interface RunRequest {
  prompt: string;
  mode: RunMode;
  provider?: RunProvider;
  skillName?: string;
  baseUrl?: string;
  model?: string;
}

export interface RunExplanation {
  task: string;
  provider: string;
  mode: string;
  finalSkill: string | null;
  whySelected: string;
  step7Summary: string;
  step8Summary: string;
  resultChecks: string[];
}

export interface RunResponse {
  runId: string;
  status: "running" | "completed" | "failed";
  steps: PipelineStep[];
  finalAnswer: string | null;
  selectedSkill: string | null;
  provider: "cursor" | "openai";
  toolEvents: ToolEvent[];
  explanation?: RunExplanation;
  error?: string;
}

export interface RunRecord extends RunResponse {
  prompt: string;
  mode: RunMode;
  createdAt: string;
}
