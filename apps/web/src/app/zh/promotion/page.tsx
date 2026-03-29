import { useState, useEffect } from 'react';

export default function PromotionPage() {
  const [stats, setStats] = useState({ inviteCode: '', referrals: 0, earnings: 0 });

  useEffect(() => {
    fetch('/api/user/promotion').then(r => r.json()).then(setStats);
  }, []);

  const inviteUrl = `${window.location.origin}/register?invite=${stats.inviteCode}`;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">推广中心</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">我的邀请码</h2>
        <div className="flex gap-2">
          <input value={inviteUrl} readOnly className="flex-1 px-3 py-2 border rounded" />
          <button onClick={() => navigator.clipboard.writeText(inviteUrl)}
            className="px-4 py-2 bg-blue-500 text-white rounded">复制</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-gray-500">累计邀请</div>
          <div className="text-3xl font-bold">{stats.referrals}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-gray-500">累计收益</div>
          <div className="text-3xl font-bold">{stats.earnings}</div>
        </div>
      </div>
    </div>
  );
}
