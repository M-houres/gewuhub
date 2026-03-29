import { useState } from 'react';
import { Radio, Select, Button, message } from 'antd';

export default function TaskModeSwitcher({ onSubmit }: any) {
  const [mode, setMode] = useState('rules_only');
  const [platform, setPlatform] = useState('cnki');

  return (
    <div className="space-y-4">
      <div>
        <label className="block mb-2 font-medium">执行模式</label>
        <Radio.Group value={mode} onChange={e => setMode(e.target.value)}>
          <Radio value="rules_only">本地算法（快速）</Radio>
          <Radio value="hybrid">混合模式（推荐）</Radio>
          <Radio value="llm_only">纯AI模型（高质量）</Radio>
        </Radio.Group>
      </div>

      <div>
        <label className="block mb-2 font-medium">检测平台</label>
        <Select value={platform} onChange={setPlatform} className="w-full">
          <Select.Option value="cnki">知网</Select.Option>
          <Select.Option value="weipu">维普</Select.Option>
          <Select.Option value="paperpass">PaperPass</Select.Option>
        </Select>
      </div>

      <Button type="primary" onClick={() => onSubmit({ mode, platform })} block>
        开始处理
      </Button>
    </div>
  );
}
