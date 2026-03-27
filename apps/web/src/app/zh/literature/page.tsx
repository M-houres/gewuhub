import { LongformGenerator } from "@/components/longform-generator";

export default function LiteraturePage() {
  return (
    <LongformGenerator
      title="文献综述"
      subtitle="按研究主题自动生成综述草稿，可继续在编辑器中迭代完善。"
      placeholder="请输入你的标题，或输入想法后点击 AI 拟题为你生成参考标题。"
      submitText="开始任务"
      taskType="literature"
    />
  );
}
