import { useState } from 'react';

export default function TaskSubmitButton({ onSubmit, loading }: any) {
  return (
    <button
      onClick={onSubmit}
      disabled={loading}
      className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
    >
      {loading ? '处理中...' : '提交任务'}
    </button>
  );
}
