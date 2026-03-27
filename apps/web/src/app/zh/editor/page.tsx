import { AiEditor } from "@/components/ai-editor";

export default function EditorPage() {
  return (
    <div className="space-y-4">
      <section className="dashboard-card p-5">
        <h1 className="text-2xl font-semibold text-[#242d4d]">AI编辑器</h1>
        <p className="mt-1 text-sm text-[#69739b]">基于 TipTap，支持正文编辑、快捷润色指令与审阅建议。</p>
      </section>
      <AiEditor />
    </div>
  );
}
