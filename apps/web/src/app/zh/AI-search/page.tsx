"use client";

import { getValidSession, toApiUrl } from "@/lib/auth";
import { Circle, Clock3, FileText, MessageCircleQuestion, Paperclip, Presentation, SendHorizontal, Sheet, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const tabs = ["文档", "PPT", "表格", "问答", "代码", "编稿"] as const;
type InputTab = (typeof tabs)[number];

type ModelOption = {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  pointMultiplier: number;
};

const fallbackModels: ModelOption[] = [
  { id: "mdl-fallback-1", provider: "deepseek", modelId: "deepseek-v3", displayName: "DeepSeek-V3", pointMultiplier: 1 },
];

const featureCards: Array<{
  title: string;
  desc: string;
  href: string;
  icon: typeof Wand2;
  cardClass: string;
  iconClass: string;
  extraBadge?: string;
}> = [
  {
    title: "降重复率",
    desc: "智能分析文本并提供多样化的改写建议，有效降低文章重复率",
    href: "/zh/reduce-repeat",
    icon: Wand2,
    cardClass: "bg-[#f6f7ff]",
    iconClass: "bg-[linear-gradient(135deg,#dce6ff,#4f7cff)]",
  },
  {
    title: "降AIGC率",
    desc: "优化文本内容，降低AI生成痕迹，使文章更具人文特色",
    href: "/zh/reduce-ai",
    icon: Sparkles,
    cardClass: "bg-[#f1fbff]",
    iconClass: "bg-[linear-gradient(135deg,#d9f4ff,#2ed3dc)]",
  },
  {
    title: "AIGC检测",
    desc: "仿知网、维普、Turnitin，与官方相差一般10%以内",
    href: "/zh/detect",
    icon: FileText,
    cardClass: "bg-[#fffaef]",
    iconClass: "bg-[linear-gradient(135deg,#fff5bf,#f5c91d)]",
    extraBadge: "每日限免五次!",
  },
];

const tabIconMap = {
  文档: FileText,
  PPT: Presentation,
  表格: Sheet,
  问答: MessageCircleQuestion,
  代码: Sparkles,
  编稿: Wand2,
} as const;

function mapTabToTaskType(tab: InputTab) {
  if (tab === "文档") return "article";
  if (tab === "PPT") return "ppt";
  if (tab === "表格") return "format";
  if (tab === "问答") return "literature";
  if (tab === "代码") return "review";
  return "proposal";
}

export default function AiSearchPage() {
  const router = useRouter();
  const [tab, setTab] = useState<InputTab>("文档");
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState<ModelOption[]>(fallbackModels);
  const [modelKey, setModelKey] = useState(`${fallbackModels[0].provider}:${fallbackModels[0].modelId}`);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      try {
        const response = await fetch(toApiUrl("/api/v1/models"), { method: "GET" });
        if (!response.ok) return;
        const data = (await response.json()) as ModelOption[];
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setModels(data);
          setModelKey(`${data[0].provider}:${data[0].modelId}`);
        }
      } catch {
        // use fallback model
      }
    };

    void loadModels();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedModel =
    models.find((item) => `${item.provider}:${item.modelId}` === modelKey) ??
    models[0] ??
    fallbackModels[0];

  const submitTask = async () => {
    setErrorMessage("");
    setMessage("");

    const session = getValidSession();
    if (!session) {
      router.replace(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const trimmed = prompt.trim();
    if (!trimmed) {
      setErrorMessage("请先输入需要处理的内容。");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(toApiUrl("/api/v1/tasks"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          type: mapTabToTaskType(tab),
          content: trimmed,
          mode: "balanced",
          provider: selectedModel.provider,
          modelId: selectedModel.modelId,
        }),
      });

      if (response.status === 401) {
        router.replace(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }

      if (response.status === 402) {
        const data = (await response.json().catch(() => null)) as { points?: number; required?: number } | null;
        setErrorMessage(`积分不足，当前 ${data?.points ?? "N/A"}，需要 ${data?.required ?? "N/A"}。`);
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        setErrorMessage(data?.message || "任务创建失败，请稍后重试。");
        return;
      }

      const created = (await response.json()) as { taskId: string; pointsCost: number };
      setMessage(`任务已创建：${created.taskId}（预计消耗 ${created.pointsCost} 积分）`);
    } catch {
      setErrorMessage("网络异常，请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <h1 className="mb-4 text-center text-[30px] font-semibold leading-[1.1] text-[#1f2138]">今天你想做什么？</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {featureCards.map((card) => {
            const Icon = card.icon;
            return (
              <article
                key={card.title}
                className={`relative h-[170px] overflow-hidden rounded-xl border border-[#e6e6e8] p-4 ${card.cardClass}`}
              >
                <span className="absolute left-0 top-0 rounded-br-lg bg-[#ff6d2d] px-2 py-1 text-[12px] font-bold text-white">HOT</span>
                {card.extraBadge ? (
                  <span className="absolute right-3 top-3 rounded-full bg-[#ff5c4d] px-2 py-0.5 text-[10px] font-semibold text-white">
                    {card.extraBadge}
                  </span>
                ) : null}
                <h2 className="mt-4 text-[18px] font-medium text-[#2a2b3f]">{card.title}</h2>
                <p className="mt-2 max-w-[250px] text-[12px] leading-[1.45] text-[#61637a]">{card.desc}</p>
                <Link
                  href={card.href}
                  className="mt-3 inline-flex items-center rounded-full border border-[#d9d9dd] bg-white px-3 py-1 text-[12px] text-[#4e526a]"
                >
                  立即前往 →
                </Link>
                <div className={`absolute bottom-4 right-4 rounded-lg p-2 text-white ${card.iconClass}`}>
                  <Icon size={18} />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-t border-dashed border-[#dfdfe3] pt-5">
        <div className="relative mb-2">
          <h2 className="text-center text-[26px] font-medium leading-[1.2] text-[#1f2135]">智能生成规范学术文档</h2>
          <button className="absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-[14px] text-[#6b6e84]">
            <Clock3 size={16} />
            历史任务
          </button>
        </div>
        <p className="mb-4 text-center text-[14px] text-[#5f6178]">基于2.5亿篇文献，生成包含公式、图表、交叉引用的文档</p>

        <div className="mb-3 flex flex-wrap gap-2">
          {tabs.map((item) => {
            const Icon = tabIconMap[item];
            const active = tab === item;
            return (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] ${
                  active ? "border-[#4f66ff] bg-[#eef2ff] text-[#4f66ff]" : "border-[#e2e2e6] bg-white text-[#6b6f86]"
                }`}
              >
                <Icon size={14} />
                {item}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-[#aeb3ff] bg-white">
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-3 rounded-full bg-[#e7f0ff] px-3 py-1 text-[13px] font-medium text-[#5b7dcb]">
              {tab}
            </span>
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="h-[96px] w-full resize-none border-0 bg-transparent pb-2 pl-16 pr-4 pt-3 text-[14px] text-[#2c3044] outline-none"
            placeholder="请输入文档的主题和需求，可上传参考文件与文献，让文档智能体帮你撰写..."
          />

          <div className="flex items-center justify-between px-4 pb-3 text-[12px] text-[#74788f]">
            <div className="flex items-center gap-2">
              <button className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#dbdbe1] bg-white text-[#a0a5b9]">
                <Circle size={10} />
              </button>
              <button className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#dbdbe1] bg-white text-[#7d6ff2]">
                <Sparkles size={12} />
              </button>
              <button className="rounded-full border border-[#dbdbe1] bg-white px-3 py-1">常用语</button>
              <button className="rounded-full border border-[#dbdbe1] bg-white px-3 py-1 text-[#a3a8bb]">默认5000字</button>
            </div>
            <div className="flex items-center gap-2">
              <button className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#dbdbe1] bg-white text-[#848aa3]">
                <Paperclip size={12} />
              </button>
              <button className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#dbdbe1] bg-white text-[#848aa3]">
                <Sparkles size={12} />
              </button>
              <button
                onClick={() => void submitTask()}
                disabled={submitting || !prompt.trim()}
                className="inline-flex h-6 w-10 items-center justify-center rounded-full bg-[#7248ec] text-white disabled:opacity-50"
              >
                <SendHorizontal size={13} />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[#5c66ff] bg-white p-3">
            <h3 className="text-[16px] font-medium text-[#4d59ba]">无模板</h3>
            <p className="mt-1 text-[12px] text-[#6f7492]">不提供参考模板文件，生成完成后可自定义导出特定格式 Word。</p>
          </div>
          <div className="rounded-xl border border-[#e5e6eb] bg-white p-3">
            <h3 className="text-[16px] font-medium text-[#2f3250]">格式模板</h3>
            <p className="mt-1 text-[12px] text-[#6f7492]">使用学校提供的格式模板文件，SpeedAI 将根据格式要求生成文档。</p>
          </div>
          <div className="rounded-xl border border-[#e5e6eb] bg-white p-3">
            <h3 className="text-[16px] font-medium text-[#2f3250]">全文模板</h3>
            <p className="mt-1 text-[12px] text-[#6f7492]">学长学姐分享的完整版式，SpeedAI 会在保持结构的同时生成你的内容。</p>
          </div>
        </div>

        {message ? <p className="mt-3 text-[12px] text-[#2f7e53]">{message}</p> : null}
        {errorMessage ? <p className="mt-3 text-[12px] text-[#bf3f3f]">{errorMessage}</p> : null}
      </section>
    </div>
  );
}
