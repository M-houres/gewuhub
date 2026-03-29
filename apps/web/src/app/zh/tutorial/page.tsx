export default function TutorialPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">使用教程</h1>

      <div className="space-y-6">
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">1. 降重功能</h2>
          <ol className="list-decimal list-inside space-y-2">
            <li>上传Word文档或粘贴文本</li>
            <li>选择检测平台（知网/维普）</li>
            <li>选择执行模式（本地算法/混合/纯AI）</li>
            <li>点击开始处理</li>
            <li>下载降重后的文档</li>
          </ol>
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">2. 批量处理</h2>
          <ol className="list-decimal list-inside space-y-2">
            <li>点击批量上传按钮</li>
            <li>选择多个文件（最多10个）</li>
            <li>等待处理完成</li>
            <li>批量下载结果</li>
          </ol>
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">3. 积分充值</h2>
          <ol className="list-decimal list-inside space-y-2">
            <li>进入充值页面</li>
            <li>选择套餐</li>
            <li>选择支付方式</li>
            <li>完成支付</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
