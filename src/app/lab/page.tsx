import { Suspense } from "react";
import { RunLab } from "@/components/RunLab";

export default function LabPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">运行实验室</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">
          左侧输入 Prompt 并选择 Auto / 强制 Skill；右侧查看 8
          步渐进式披露时间线。Auto 模式下，匹配完成前不会加载任何 Skill
          正文。
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">加载实验室…</p>}>
        <RunLab />
      </Suspense>
    </div>
  );
}
