# Skill Lab Web · 教师版

Next.js 可视化 **Agent Skill 渐进式披露** 教学实验室：

多目录扫描 → YAML 元数据 → 可解释启发式匹配 → 加载 SKILL.md → **多轮工具 Agent**（Cursor / OpenAI 兼容可切换）。

## 快速开始

```bash
cp .env.example .env.local
# 编辑 .env.local：填 SKILL_LAB_CURSOR_KEY 或 CURSOR_API_KEY，和/或 OPENAI_API_KEY（不要把密钥贴到聊天）

npm install
npm run dev
```

打开 http://localhost:3000

## Provider

| Provider | Key | 说明 |
|----------|-----|------|
| Cursor Agent | `SKILL_LAB_CURSOR_KEY`（发布）→ 本地 `CURSOR_API_KEY` → `LLM_API_KEY` | `@cursor/sdk` 真实 Agent + tool_call 观测；**不用** custom systemPrompt |
| OpenAI-compatible | `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `LLM_API_KEY` | Chat Completions + tools 循环（read/write/run_terminal/glob） |

发布到 Cursor Apps 时 **不要** 绑定 `CURSOR_API_KEY`（平台保留前缀）；请绑定 `SKILL_LAB_CURSOR_KEY`。

`.env.example` 还包含 `AI_BASE_URL`、`AI_MODEL`、`AGENT_MAX_ITERATIONS`、`RUN_PROVIDER`、`SKILL_LAB_PERSONAL_DIR`。

DeepSeek 只是可选兼容后端示例，不是硬依赖。

## 教师演示（博客 URL）

1. 配置 Cursor Key（或兼容 Key）
2. 打开 `/lab`，Provider 选 Cursor（或 Auto）
3. 勾选 Auto 匹配
4. Prompt：

```
翻译 https://waitbutwhy.com/2023/05/baby.html 并归档中文译文
```

5. 预期：Step5 最高分为 `english-blog-translate`，matchedTerms 含 翻译/url；Step8 出现工具调用；成功时工作区出现 `waitbutwhy.com/baby.md` 与 `waitbutwhy.com/中译-baby.md`

## 页面

- `/` 首页
- `/skills` 多 scope 目录
- `/skills/[name]` Skill 工作台（预览/编辑/规范/依赖/版本）
- `/lab` 运行实验室
- `/runs/[runId]` 运行报告

## 脚本

```bash
npm test
npm run build
npm run dev
```
