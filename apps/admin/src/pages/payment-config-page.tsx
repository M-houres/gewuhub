import { useState, useEffect } from 'react';
import { Form, Input, Switch, Button, Card, message } from 'antd';

export default function PaymentConfigPage() {
  const [form] = Form.useForm();

  useEffect(() => {
    fetch('/api/admin/payment-config').then(r => r.json()).then(data => {
      form.setFieldsValue(data);
    });
  }, []);

  const onSave = async (values: any) => {
    await fetch('/api/admin/payment-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    message.success('保存成功');
  };

  return (
    <div>
      <Card title="微信支付配置" className="mb-4">
        <Form form={form} onFinish={onSave} layout="vertical">
          <Form.Item name={['wechat', 'enabled']} label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name={['wechat', 'appId']} label="AppID">
            <Input />
          </Form.Item>
          <Form.Item name={['wechat', 'mchId']} label="商户号">
            <Input />
          </Form.Item>
          <Form.Item name={['wechat', 'apiKey']} label="API密钥">
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit">保存</Button>
        </Form>
      </Card>

      <Card title="支付宝配置">
        <Form form={form} onFinish={onSave} layout="vertical">
          <Form.Item name={['alipay', 'enabled']} label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name={['alipay', 'appId']} label="AppID">
            <Input />
          </Form.Item>
          <Form.Item name={['alipay', 'privateKey']} label="私钥">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Button type="primary" htmlType="submit">保存</Button>
        </Form>
      </Card>
    </div>
  );
}
