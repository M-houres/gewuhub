export default function FeaturePlaceholderPage({ params }: { params: { feature: string } }) {
  return (
    <section className="dashboard-card p-6">
      <h1 className="text-2xl font-semibold text-[#252e50]">功能建设中：{params.feature}</h1>
      <p className="mt-2 text-sm text-[#6c7598]">该路由暂未分配独立页面，后续会按业务优先级补齐交互与 API 联调。</p>
    </section>
  );
}
