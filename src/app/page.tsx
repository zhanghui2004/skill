import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Skill Lab · 教师版
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
          可视化 Agent Skill 渐进式披露与可解释匹配：多目录扫描 → YAML 元数据 →
          启发式打分 → 加载正文 → 多轮工具执行（Cursor Agent / OpenAI 兼容）。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/skills"
          className="rounded border border-zinc-200 bg-white p-4 hover:border-zinc-400"
        >
          <div className="font-medium text-zinc-900">Skill 目录 / 工作台</div>
          <p className="mt-1 text-sm text-zinc-600">
            多 scope 列表，预览/编辑/规范检查。
          </p>
        </Link>
        <Link
          href="/lab"
          className="rounded border border-zinc-200 bg-white p-4 hover:border-zinc-400"
        >
          <div className="font-medium text-zinc-900">运行实验室</div>
          <p className="mt-1 text-sm text-zinc-600">
            Provider 切换、Auto 匹配、8 步讲解时间线。
          </p>
        </Link>
        <Link
          href="/skills/english-blog-translate"
          className="rounded border border-zinc-200 bg-white p-4 hover:border-zinc-400"
        >
          <div className="font-medium text-zinc-900">旗舰 Skill</div>
          <p className="mt-1 text-sm text-zinc-600">
            english-blog-translate：URL 抓取与中译归档。
          </p>
        </Link>
      </div>

      <section className="rounded border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
        <h2 className="font-semibold text-zinc-900">推荐演示 Prompt</h2>
        <pre className="mt-2 overflow-auto rounded bg-zinc-50 p-3 text-xs">
{`翻译 https://waitbutwhy.com/2023/05/baby.html 并归档中文译文`}
        </pre>
        <p className="mt-2 text-zinc-600">
          Auto 模式下应命中 english-blog-translate；Step5 可见 matchedTerms 含
          翻译/url。
        </p>
      </section>
    </div>
  );
}
