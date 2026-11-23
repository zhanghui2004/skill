import { OPENAI_AGENT_TOOLS, executeLabTool } from "./agent-tools";
import { getMaxIterations, getOpenAICompatKey } from "./providers";
import type { ToolEvent } from "./types";

export interface OpenAIAgentResult {
  finalAnswer: string;
  toolEvents: ToolEvent[];
  iterations: number;
  contextLength: number;
  responseLength: number;
}

interface ChatMessage {
  role: string;
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export async function runOpenAICompatibleAgent(options: {
  systemSkill: string;
  userPrompt: string;
  baseUrl: string;
  model: string;
}): Promise<OpenAIAgentResult> {
  const apiKey = getOpenAICompatKey();
  if (!apiKey) {
    throw new Error(
      "未配置 OpenAI 兼容 API Key。请设置 OPENAI_API_KEY / DEEPSEEK_API_KEY / LLM_API_KEY。"
    );
  }

  const maxIter = getMaxIterations();
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是 Skill Lab 中的工具型 Agent。必须使用提供的工具完成任务（读文件、跑脚本、写结果），不要空想已抓取网页。
工作区相对路径；运行命令时 cwd 已是工作区根。
Skill 说明：
${options.systemSkill}`,
    },
    { role: "user", content: options.userPrompt },
  ];

  const toolEvents: ToolEvent[] = [];
  let iterations = 0;
  let finalAnswer = "";
  const url = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;

  for (let i = 0; i < maxIter; i++) {
    iterations = i + 1;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        tools: OPENAI_AGENT_TOOLS,
        tool_choice: "auto",
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `OpenAI 兼容请求失败（HTTP ${res.status}）：${text.slice(0, 400)}`
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: ChatMessage; finish_reason?: string }>;
    };
    const message = json.choices?.[0]?.message;
    if (!message) throw new Error("模型返回空 message");

    messages.push(message);

    const toolCalls = message.tool_calls || [];
    if (!toolCalls.length) {
      finalAnswer = message.content || "";
      break;
    }

    for (const call of toolCalls) {
      const name = call.function?.name || "unknown";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}") as Record<
          string,
          unknown
        >;
      } catch {
        args = { raw: call.function?.arguments };
      }
      const started: ToolEvent = {
        callId: call.id,
        name,
        status: "started",
        args,
        timestamp: Date.now(),
      };
      toolEvents.push(started);
      const resultText = await executeLabTool(name, args);
      toolEvents.push({
        callId: call.id,
        name,
        status: "completed",
        args,
        result: resultText.slice(0, 4000),
        timestamp: Date.now(),
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: resultText,
      });
    }
  }

  if (!finalAnswer) {
    finalAnswer =
      "已达 AGENT_MAX_ITERATIONS，尚未得到最终文本答复。请查看工具事件与工作区产出文件。";
  }

  const contextLength = JSON.stringify(messages).length;
  return {
    finalAnswer,
    toolEvents,
    iterations,
    contextLength,
    responseLength: finalAnswer.length,
  };
}
