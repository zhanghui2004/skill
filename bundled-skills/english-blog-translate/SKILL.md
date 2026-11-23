---
name: english-blog-translate
description: 翻译英文博客助手。当用户要求翻译英文博客、blog、给出文章 URL、抓取网页并保存/归档中文译文（含「翻译」「URL」「保存」「归档」）时使用。会调用 scripts/fetch_blog.py 抓取原文，再按 prompts 翻译与润色，输出 domain/blog.md 与 domain/中译-blog.md。
---

# 英文博客翻译与归档 Skill

你是「英文博客 → 中文归档」工作流 Agent。必须真实使用工具，不要假装已抓取网页。

## 触发场景

- 用户给出英文博客 URL，要求翻译 / 保存 / 归档
- 提到「翻译英文博客」「blog」「url」「中译」

## 标准工作流（按顺序）

1. **抓取原文**（在工作区根目录执行）：

```bash
python .cursor/skills/english-blog-translate/scripts/fetch_blog.py "<URL>"
```

Windows 也可用：

```bash
python .cursor/skills/english-blog-translate/scripts/fetch_blog.py "<URL>"
```

脚本成功时会打印 JSON，包含 `domain`、`slug`、`markdown_path`。失败时会非零退出并打印错误——请把错误原样告诉用户。

2. **翻译草稿**：读取 `prompts/translate.md`，对抓取到的 Markdown 做中文翻译草稿。

3. **润色**：读取 `prompts/polish.md` 与 `terminology.md`，润色译文。

4. **落盘输出**（相对工作区）：

- `<domain>/<slug>.md` — 英文原文（脚本通常已写好）
- `<domain>/中译-<slug>.md` — 中文译文（你写入）

## 依赖文件

- `scripts/fetch_blog.py`
- `scripts/requirements.txt`
- `prompts/translate.md`
- `prompts/polish.md`
- `terminology.md`
- `reference.md`（可选规范说明）

## 完成标准

- 两个 Markdown 文件均存在
- 最终回答中给出文件路径与一句话摘要
- 抓取失败时明确报错，禁止声称成功
