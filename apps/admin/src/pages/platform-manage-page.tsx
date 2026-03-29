import { useState, useEffect } from 'react';
import { Table, Button, Switch, Upload, Modal, Form, Select, Input, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

export default function PlatformManagePage() {
  const [platforms, setPlatforms] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetch('/api/admin/platforms').then(r => r.json()).then(setPlatforms);
  }, []);

  const togglePlatform = async (id: string, enabled: boolean) => {
    await fetch(`/api/admin/platforms/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    message.success('更新成功');
  };

  const uploadRule = async (values: any) => {
    const formData = new FormData();
    formData.append('file', values.file[0].originFileObj);
    formData.append('platformCode', values.platformCode);
    formData.append('taskType', values.taskType);

    await fetch('/api/admin/rules/upload', { method: 'POST', body: formData });
    message.success('上传成功');
    setModalOpen(false);
  };

  return (
    <div>
      <Button onClick={() => setModalOpen(true)}>上传规则</Button>
      <Table dataSource={platforms} rowKey="id">
        <Table.Column title="平台" dataIndex="name" />
        <Table.Column title="状态" render={(_, r: any) =>
          <Switch checked={r.enabled} onChange={v => togglePlatform(r.id, v)} />
        } />
      </Table>

      <Modal open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()}>
        <Form form={form} onFinish={uploadRule}>
          <Form.Item name="platformCode" label="平台" rules={[{ required: true }]}>
            <Select options={[{ label: '知网', value: 'cnki' }, { label: '维普', value: 'weipu' }]} />
          </Form.Item>
          <Form.Item name="taskType" label="任务类型" rules={[{ required: true }]}>
            <Select options={[{ label: '检测', value: 'detect' }, { label: '降重', value: 'rewrite_reduce_repeat' }]} />
          </Form.Item>
          <Form.Item name="file" label="规则文件" rules={[{ required: true }]}>
            <Upload maxCount={1}><Button icon={<UploadOutlined />}>选择文件</Button></Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
