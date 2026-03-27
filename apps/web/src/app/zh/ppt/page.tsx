import { LongformGenerator } from "@/components/longform-generator";

export default function PptPage() {
  return (
    <div className="space-y-4">
      <section className="dashboard-card p-5">
        <h1 className="text-2xl font-semibold text-[#242d4d]">AI PPT</h1>
        <p className="mt-1 text-sm text-[#69739b]">输入主题与受众，自动生成演示结构和页面建议。</p>
      </section>
      <LongformGenerator
        title="PPT 大纲生成器"
        subtitle="适配课程汇报、开题答辩和项目复盘等演示场景。"
        placeholder="示例：主题“AI 助力高校论文写作”，受众为研究生导师组，时长 12 分钟，请输出 10 页左右的演示大纲。"
        submitText="生成 PPT 大纲"
        taskType="ppt"
      />
    </div>
  );
}
