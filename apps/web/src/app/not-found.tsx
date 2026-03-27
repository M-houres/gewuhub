import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f5ff] px-6">
      <section className="w-full max-w-[560px] rounded-2xl border border-[#dfe4ff] bg-white p-7 text-center shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-[#7f88b1]">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#2a3151]">页面不存在</h1>
        <p className="mt-2 text-sm text-[#62709a]">你访问的地址可能已变更或输入有误。</p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <Link href="/" className="rounded-xl border border-[#dbe1fb] bg-white px-4 py-2 text-sm text-[#4f59a1]">
            返回首页
          </Link>
          <Link href="/zh/reduce-repeat" className="rounded-xl bg-[#6366f1] px-4 py-2 text-sm font-semibold text-white">
            进入工作台
          </Link>
        </div>
      </section>
    </main>
  );
}
