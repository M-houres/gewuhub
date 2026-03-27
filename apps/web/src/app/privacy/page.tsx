import Link from "next/link";

const sections = [
  {
    title: "1. 我们收集的信息",
    content:
      "我们会收集注册登录信息（如邮箱）、账户与积分信息、任务记录、支付订单记录，以及你主动提交的文本/文件内容，用于完成 AI 处理服务。",
  },
  {
    title: "2. 信息使用目的",
    content:
      "收集的信息仅用于账号管理、任务执行、计费结算、安全风控、故障排查与服务优化。未经授权，我们不会将个人信息用于与平台无关的用途。",
  },
  {
    title: "3. 信息存储与保护",
    content:
      "我们采取访问控制、日志审计、密钥隔离等安全措施。上传文件与生成结果会按平台策略保存并清理，管理员无法越权访问普通用户私有数据。",
  },
  {
    title: "4. 第三方服务",
    content:
      "平台可能调用第三方 AI 模型、对象存储、邮件和支付服务。相关数据传输将遵循最小必要原则，并受对应服务商条款约束。",
  },
  {
    title: "5. 你的权利",
    content:
      "你可以申请查询、更正或删除账号信息，并可在符合法规与平台规则的前提下申请注销账户。部分交易与审计记录需按法律要求保留。",
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[920px] px-4 pb-16 pt-10 md:px-8">
      <section className="dashboard-card p-6 md:p-8">
        <h1 className="text-2xl font-semibold text-[#212a4a] md:text-3xl">隐私政策</h1>
        <p className="mt-2 text-sm text-[#68739b]">更新日期：2026-03-26。我们重视并保护你的个人信息与数据安全。</p>

        <div className="mt-6 space-y-5">
          {sections.map((section) => (
            <article key={section.title}>
              <h2 className="text-base font-semibold text-[#2a3560]">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-[#556189]">{section.content}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 text-sm text-[#69749b]">
          隐私相关问题请联系：
          <a href="mailto:privacy@gewu.local" className="ml-1 text-[#4b58b8] hover:underline">
            privacy@gewu.local
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
