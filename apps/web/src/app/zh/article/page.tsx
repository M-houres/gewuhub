import { LongformGenerator } from "@/components/longform-generator";

export default function ArticlePage() {
  return (
    <LongformGenerator
      title="文章生成"
      subtitle="支持摘要、引言、方法、讨论等章节分段生成与统一风格改写。"
      placeholder="请输入你的标题，或输入想法后点击 AI 拟题为你生成参考标题。"
      submitText="开始任务"
      taskType="article"
    />
  );
}
