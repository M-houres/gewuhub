import { useState, useEffect } from 'react';
import { Form, InputNumber, Button, message, Card } from 'antd';

export default function PromotionConfigPage() {
  const [form] = Form.useForm();

  useEffect(() => {
    fetch('/api/admin/promotion-config').then(r => r.json()).then(data => {
      form.setFieldsValue(data);
    });
  }, []);

  const onSave = async (values: any) => {
    await fetch('/api/admin/promotion-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    message.success('保存成功');
  };

  return (
    <Card title="推广配置">
      <Form form={form} onFinish={onSave} layout="vertical">
        <Form.Item name="referralReward" label="推荐奖励积分">
          <InputNumber min={0} />
        </Form.Item>
        <Form.Item name="firstOrderReward" label="首单奖励积分">
          <InputNumber min={0} />
        </Form.Item>
        <Button type="primary" htmlType="submit">保存</Button>
      </Form>
    </Card>
  );
}
