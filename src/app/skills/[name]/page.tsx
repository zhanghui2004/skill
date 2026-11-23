import Link from "next/link";
import { notFound } from "next/navigation";
import { SkillWorkbench } from "@/components/SkillWorkbench";
import { loadSkillDetail, parseSkillDependencies } from "@/lib/skills";

export const dynamic = "force-dynamic";

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const skill = await loadSkillDetail(decodeURIComponent(name));
  if (!skill) notFound();
  const dependencies = parseSkillDependencies(skill.raw);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/skills" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← 返回目录
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
          {skill.name}
        </h1>
        <p className="mt-2 text-sm text-zinc-600">{skill.description}</p>
        <p className="mt-2 text-xs text-zinc-400">
          scope={skill.scope} · {skill.path} · {skill.lines} lines
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span
            className={`inline-block rounded px-2 py-0.5 text-xs ${
              skill.valid
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-900"
            }`}
          >
            {skill.valid ? "格式有效" : "格式不完整"}
          </span>
          <Link
            href={`/lab?skill=${encodeURIComponent(skill.name)}`}
            className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white"
          >
            在运行实验室中使用
          </Link>
        </div>
      </div>

      <SkillWorkbench skill={skill} dependencies={dependencies} />
    </div>
  );
}
