"use client";

import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import type { ReactElement } from "react";

const SafeEditorContent = EditorContent as unknown as (props: {
  editor: unknown;
  className?: string;
}) => ReactElement;

const sampleContent = `
<h2>格物 AI 编辑器</h2>
<p>这是一个可编辑区域，你可以在这里继续扩写论文段落，或用右侧工具进行润色与改写。</p>
<ul>
  <li>支持基础文本样式与列表</li>
  <li>后续会接入模型指令和批注审阅</li>
</ul>
`;

export function AiEditor() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: sampleContent,
    immediatelyRender: false,
  });

  if (!editor) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="dashboard-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[#e0e5ff] bg-[#f8f9ff] p-3">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className="rounded border border-[#d6dcfc] px-2 py-1 text-xs text-[#4e58a0]"
          >
            加粗
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className="rounded border border-[#d6dcfc] px-2 py-1 text-xs text-[#4e58a0]"
          >
            斜体
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className="rounded border border-[#d6dcfc] px-2 py-1 text-xs text-[#4e58a0]"
          >
            列表
          </button>
          <button
            onClick={() => editor.chain().focus().undo().run()}
            className="rounded border border-[#d6dcfc] px-2 py-1 text-xs text-[#4e58a0]"
          >
            撤销
          </button>
        </div>
        <SafeEditorContent
          editor={editor}
          className="min-h-[560px] p-4 text-sm leading-7 text-[#2c355b] [&_.ProseMirror]:min-h-[520px] [&_.ProseMirror]:outline-none"
        />
      </section>

      <aside className="space-y-4">
        <section className="dashboard-card p-4">
          <h3 className="text-base font-semibold text-[#2c355b]">快捷指令</h3>
          <div className="mt-3 space-y-2">
            {["学术润色", "降低AIGC痕迹", "扩写讨论部分", "精简摘要", "统一参考文献格式"].map((item) => (
              <button
                key={item}
                className="w-full rounded-lg border border-[#dce1fc] bg-white px-3 py-2 text-left text-sm text-[#4a5486] transition hover:bg-[#f7f8ff]"
              >
                {item}
              </button>
            ))}
          </div>
        </section>
        <section className="dashboard-card p-4">
          <h3 className="text-base font-semibold text-[#2c355b]">审阅建议</h3>
          <ul className="mt-3 space-y-2 text-sm text-[#5e6892]">
            <li>方法章节术语使用一致性较好，可保持。</li>
            <li>讨论部分可增加与近三年文献的对比。</li>
            <li>摘要长度略长，建议压缩到 300 字以内。</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
