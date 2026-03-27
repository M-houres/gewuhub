import Link from "next/link";

const sections = [
  {
    title: "1. 服务说明",
    content:
      "Gewu（格物）提供 AI 学术辅助工具，包括文本改写、检测、文献整理和编辑辅助。平台输出仅作为研究与写作辅助建议，用户应自行复核内容准确性与合规性。",
  },
  {
    title: "2. 账号与安全",
    content:
      "用户应妥善保管账号与登录凭证，不得将账号转让、出租或出借。因账号保管不当造成的风险与损失由账号持有人承担。",
  },
  {
    title: "3. 内容与责任",
    content:
      "用户需确保上传和输入内容拥有合法使用权，不得上传违法、侵权或含恶意代码的内容。平台有权对违规内容与账号采取限制措施。",
  },
  {
    title: "4. 计费与退款",
    content:
      "平台采用积分与套餐机制，扣费逻辑以服务端记录为准。已消耗积分部分不支持直接退回，具体退款政策以订单与平台公告为准。",
  },
  {
    title: "5. 服务变更",
    content:
      "平台可在必要时对功能、规则、价格和协议进行调整，并通过站内公告或邮件通知。用户继续使用即视为接受更新后的条款。",
  },
];

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-[920px] px-4 pb-16 pt-10 md:px-8">
      <section className="dashboard-card p-6 md:p-8">
        <h1 className="text-2xl font-semibold text-[#212a4a] md:text-3xl">用户协议</h1>
        <p className="mt-2 text-sm text-[#68739b]">
          生效日期：2026-03-26。请在使用 Gewu（格物）前仔细阅读本协议。
        </p>

        <div className="mt-6 space-y-5">
          {sections.map((section) => (
            <article key={section.title}>
              <h2 className="text-base font-semibold text-[#2a3560]">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-[#556189]">{section.content}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 text-sm text-[#69749b]">
          如有问题，请联系平台支持邮箱：
          <a href="mailto:support@gewu.local" className="ml-1 text-[#4b58b8] hover:underline">
            support@gewu.local
          </a>
          。
        </div>

        <div className="mt-6">
          <Link href="/" className="text-sm font-medium text-[#4b58b8] hover:underline">
            返回首页
          </Link>
        </div>
      </section>
    </main>
  );
}
