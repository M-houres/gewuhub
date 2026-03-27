import { LongformGenerator } from "@/components/longform-generator";

export default function ProposalPage() {
  return (
    <LongformGenerator
      title="开题报告"
      subtitle="覆盖研究背景、研究目标、技术路线与进度计划等标准章节。"
      placeholder="请输入你的标题，或输入想法后点击 AI 拟题为你生成参考标题。"
      submitText="开始任务"
      taskType="proposal"
    />
  );
}
