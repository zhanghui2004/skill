import Link from "next/link";
import { notFound } from "next/navigation";
import { StepTimeline } from "@/components/StepTimeline";
import { loadRunRecord } from "@/lib/runs";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await loadRunRecord(runId);
  if (!run) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/lab" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← 返回实验室
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">运行报告</h1>
        <p className="mt-1 text-xs text-zinc-500">
          {run.runId} · {run.createdAt} · {run.status} · {run.provider}
        </p>
      </div>

      {run.explanation && (
        <section className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">完整解释摘要</h2>
          <p className="mt-2">任务：{run.explanation.task}</p>
          <p>
            Provider / 模式：{run.explanation.provider} / {run.explanation.mode}
          </p>
          <p>最终 Skill：{run.explanation.finalSkill || "—"}</p>
          <p>为何选中：{run.explanation.whySelected}</p>
          <p>Step7：{run.explanation.step7Summary}</p>
          <p>Step8：{run.explanation.step8Summary}</p>
          <ul className="mt-2 list-disc pl-5">
            {run.explanation.resultChecks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">时间线</h2>
        <StepTimeline steps={run.steps} />
      </section>

      {run.finalAnswer && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">最终回答</h2>
          <pre className="whitespace-pre-wrap rounded border border-zinc-200 bg-white p-4 text-sm">
            {run.finalAnswer}
          </pre>
        </section>
      )}

      {run.error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {run.error}
        </div>
      )}
    </div>
  );
}
