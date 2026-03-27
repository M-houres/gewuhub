import { LongformGenerator } from "@/components/longform-generator";

export default function FormatPage() {
  return (
    <div className="space-y-4">
      <section className="dashboard-card p-5">
        <h1 className="text-2xl font-semibold text-[#242d4d]">格式调整</h1>
        <p className="mt-1 text-sm text-[#69739b]">检查标题层级、参考文献、图表编号和摘要版式一致性。</p>
      </section>
      <LongformGenerator
        title="格式检查与修订建议"
        subtitle="输入稿件说明或粘贴核心段落，生成可执行的格式修订清单。"
        placeholder="示例：硕士论文终稿，学校模板要求一级标题黑体三号，参考文献按 GB/T 7714。请输出格式检查与修订建议。"
        submitText="生成格式检查报告"
        taskType="format"
      />
    </div>
  );
}
