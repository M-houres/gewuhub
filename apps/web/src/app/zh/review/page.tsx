import { LongformGenerator } from "@/components/longform-generator";

export default function ReviewPage() {
  return (
    <div className="space-y-4">
      <section className="dashboard-card p-5">
        <h1 className="text-2xl font-semibold text-[#242d4d]">AI 审稿</h1>
        <p className="mt-1 text-sm text-[#69739b]">从结构、表达、引用规范三个维度输出审稿意见。</p>
      </section>
      <LongformGenerator
        title="审稿意见生成器"
        subtitle="支持课程论文、会议投稿和阶段汇报稿件的快速评审。"
        placeholder="示例：请评审这篇关于“教育数据挖掘”的论文初稿，重点关注方法严谨性、实验对比和引用规范。"
        submitText="生成审稿意见"
        taskType="review"
      />
    </div>
  );
}
