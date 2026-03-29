import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

type TutorialStatus = "draft" | "published";

type TutorialRow = {
  id: string;
  slug: string;
  title: string;
  tag: string;
  summary: string;
  content: string;
  status: TutorialStatus;
  createdAt: string;
  updatedAt: string;
};

type TutorialFormValue = {
  slug?: string;
  title: string;
  tag: string;
  summary: string;
  content: string;
  status: TutorialStatus;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

export function ContentPage() {
  const [rows, setRows] = useState<TutorialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<TutorialRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<TutorialFormValue>();
  const [msgApi, contextHolder] = message.useMessage();

  const loadTutorials = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<TutorialRow[]>("/api/v1/admin/content/tutorials");
      setRows(data);
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "加载教程失败");
    } finally {
      setLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    void loadTutorials();
  }, [loadTutorials]);

  const openCreateModal = () => {
    setEditingRow(null);
    setOpen(true);
    form.setFieldsValue({
      title: "",
      slug: "",
      tag: "de-AIGC",
      summary: "",
      content: "",
      status: "draft",
    });
  };

  const openEditModal = (row: TutorialRow) => {
    setEditingRow(row);
    setOpen(true);
    form.setFieldsValue({
      title: row.title,
      slug: row.slug,
      tag: row.tag,
      summary: row.summary,
      content: row.content,
      status: row.status,
    });
  };

  const closeModal = () => {
    setOpen(false);
    setEditingRow(null);
    form.resetFields();
  };

  const submitTutorial = async () => {
    let values: TutorialFormValue;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    try {
      setSaving(true);
      if (editingRow) {
        await fetchJson(`/api/v1/admin/content/tutorials/${editingRow.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        msgApi.success("教程已更新");
      } else {
        await fetchJson("/api/v1/admin/content/tutorials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        msgApi.success("教程已创建");
      }
      closeModal();
      await loadTutorials();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "保存教程失败");
    } finally {
      setSaving(false);
    }
  };

  const removeTutorial = async (id: string) => {
    try {
      await fetchJson(`/api/v1/admin/content/tutorials/${id}`, {
        method: "DELETE",
      });
      msgApi.success("教程已删除");
      await loadTutorials();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "删除教程失败");
    }
  };

  const columns: ColumnsType<TutorialRow> = [
    { title: "标题", dataIndex: "title", key: "title", width: 260 },
    { title: "别名", dataIndex: "slug", key: "slug", width: 180 },
    { title: "标签", dataIndex: "tag", key: "tag", width: 120 },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: TutorialStatus) => <Tag color={status === "published" ? "green" : "orange"}>{status === "published" ? "已发布" : "草稿"}</Tag>,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      render: (_value, row) => (
        <Space>
          <Button size="small" onClick={() => openEditModal(row)}>
            编辑
          </Button>
          <Popconfirm title="确认删除该教程？" onConfirm={() => void removeTutorial(row.id)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <Card
        title="教程管理"
        extra={
          <Space>
            <Button onClick={() => void loadTutorials()} loading={loading}>
              刷新
            </Button>
            <Button type="primary" onClick={openCreateModal}>
              新建教程
            </Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 1100 }} />
      </Card>

      <Modal
        title={editingRow ? `编辑教程：${editingRow.title}` : "创建教程"}
        open={open}
        onCancel={closeModal}
        onOk={() => void submitTutorial()}
        confirmLoading={saving}
        width={760}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="slug" label="别名（可选）">
            <Input placeholder="为空时根据标题自动生成" />
          </Form.Item>
          <Form.Item name="tag" label="标签" rules={[{ required: true, message: "请输入标签" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="summary" label="摘要" rules={[{ required: true, message: "请输入摘要" }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: "请输入内容" }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "draft", label: "草稿" },
                { value: "published", label: "已发布" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}




