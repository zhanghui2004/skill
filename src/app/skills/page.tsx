import Link from "next/link";
import { listSkillMetadata, scanScopeSummary } from "@/lib/skills";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const skills = await listSkillMetadata();
  const scopes = await scanScopeSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Skill 目录</h1>
        <p className="mt-2 text-sm text-zinc-600">
          多作用域扫描：project / agents / user。点进详情进入工作台。
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {scopes.map((s) => (
          <div
            key={s.scope}
            className="rounded border border-zinc-200 bg-white p-3 text-sm"
          >
            <div className="font-medium text-zinc-900">{s.scope}</div>
            <div className="text-xs text-zinc-500">{s.label}</div>
            <div className="mt-1 text-zinc-700">{s.count} skills</div>
          </div>
        ))}
      </div>

      {skills.length === 0 ? (
        <p className="text-sm text-zinc-500">未找到任何 Skill。</p>
      ) : (
        <ul className="space-y-3">
          {skills.map((s) => (
            <li
              key={`${s.scope}-${s.folder}`}
              className="rounded border border-zinc-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/skills/${encodeURIComponent(s.name)}`}
                    className="text-base font-medium text-zinc-900 hover:underline"
                  >
                    {s.name}
                  </Link>
                  <p className="mt-1 text-sm text-zinc-600">{s.description}</p>
                  <p className="mt-2 text-xs text-zinc-400">
                    [{s.scope}] {s.path} · {s.lines} lines
                    {s.disableModelInvocation ? " · disable-model-invocation" : ""}
                  </p>
                </div>
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs ${
                    s.valid
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {s.valid ? "格式有效" : "格式不完整"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
