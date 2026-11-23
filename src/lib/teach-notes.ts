import type { TeachNote } from "./types";

/** Fixed four-part Chinese explanations for Steps 1–8 (teacher edition). */
export const STEP_TEACH_NOTES: Record<string, TeachNote> = {
  init: {
    做什么: "初始化运行环境：选择 Provider、检查是否配置了 API Key、读取模型与迭代上限。",
    Cursor真实行为:
      "Cursor 启动 Agent 时会解析账号凭证与模型；实验室对应展示 hasApiKey / provider，不展示密钥。",
    实验室如何展示:
      "步骤数据包含 provider、hasApiKey、model、baseUrl、AGENT_MAX_ITERATIONS、扫描作用域列表。",
    要点: [
      "密钥只以 hasApiKey 布尔值出现",
      "Cursor 与 OpenAI 兼容可切换",
      "默认按已配置的 Key 自动选 Provider",
      "缺失 Key 时给出中文指引，不崩溃",
    ],
  },
  scan: {
    做什么: "扫描多目录 Skill 文件夹，按作用域分组统计。",
    Cursor真实行为:
      "真实 Cursor 会合并项目 .cursor/skills、用户 ~/.cursor/skills 等来源（及 skills.sh 类生态目录概念）。",
    实验室如何展示:
      "列出 project / agents / user 三组路径与数量；缺失目录记为 0 skills，不报错中断。",
    要点: [
      "scope=project → .cursor/skills/",
      "scope=agents → .agents/skills/",
      "scope=user → ~/.cursor/skills 或 SKILL_LAB_PERSONAL_DIR",
      "每个 skill 带 scope 标签",
    ],
  },
  "parse-yaml": {
    做什么: "只解析 YAML 头（渐进式披露），提取路由用元数据。",
    Cursor真实行为:
      "Cursor 启动时优先读 name/description 做发现与匹配；disable-model-invocation 的 skill 不进自动调用池。",
    实验室如何展示:
      "展示 name、description、path、lines、disableModelInvocation；此时不加载正文。",
    要点: [
      "仅 frontmatter，body 未加载",
      "lines 用于规范检查提示",
      "disableModelInvocation=true 时目录可见但 Auto 排除",
      "格式校验：name + description 必填",
    ],
  },
  prompt: {
    做什么: "接收并结构化用户 Prompt。",
    Cursor真实行为: "用户输入进入 Agent 对话；是否含 URL 会影响是否触发抓取类 skill。",
    实验室如何展示: "回显 prompt、字符数、hasUrl、是否预选 skill。",
    要点: [
      "记录 charCount",
      "检测 URL 供匹配加权",
      "Auto 时不预选 skill",
      "Force 时记录实验室指定名",
    ],
  },
  match: {
    做什么: "用可解释启发式对 description 打分，模拟「按描述匹配」。",
    Cursor真实行为:
      "真实 Cursor 常用模型阅读 description 做路由；实验室用 token 重叠 + 触发词表 + URL 加权，便于教学。",
    实验室如何展示:
      "每个候选显示 score、matchedTerms、可选分数条；Auto 取最高分>0，全 0 则报「没有匹配的 skill」。",
    要点: [
      "不依赖 LLM 才能完成匹配演示",
      "trigger 词表覆盖翻译/摘要/会议/blog/url",
      "含 URL 时抬升 blog/translate 类 skill",
      "disableModelInvocation 的 skill 不进 Auto 池",
    ],
  },
  select: {
    做什么: "确定最终 Skill 或给出无法匹配的结论。",
    Cursor真实行为: "路由结果决定随后是否加载完整 SKILL.md 与附属文件。",
    实验室如何展示:
      "Auto：选最高分；Force：仍展示分数但理由为「实验室指定」。",
    要点: [
      "记录 selected 与 reason",
      "Force 模式不影响分数展示",
      "无匹配时进入失败/直答分支（教学上标错误）",
      "选定后才进入加载正文",
    ],
  },
  load: {
    做什么: "匹配成功后加载完整 SKILL.md 与相关附属文件清单。",
    Cursor真实行为:
      "真实 Agent 会读 SKILL.md，并可能继续读 reference / prompts / terminology / scripts。",
    实验室如何展示:
      "展示 body 摘要、文件树（SKILL.md、prompts/、scripts/ 等）与已发现依赖。",
    要点: [
      "渐进式披露：此前未读正文",
      "列出 prompts / scripts / terminology",
      "为 Step8 工具调用准备上下文",
      "可折叠查看完整正文",
    ],
  },
  execute: {
    做什么: "多轮 Agent 执行：允许工具调用直至完成或达到迭代上限。",
    Cursor真实行为:
      "Cursor Agent 会 read/shell/edit 等；实验室观察 tool_call 事件并统计次数。",
    实验室如何展示:
      "记录 iterations、toolCallCount、contextLength、responseLength 与 toolEvents 列表。",
    要点: [
      "不是单次 chat 完成",
      "Cursor：SDK stream tool_call",
      "OpenAI 兼容：tools 循环（read/write/run_terminal/glob）",
      "run_terminal 限制在工作区内；日志不含 Key",
    ],
  },
};
