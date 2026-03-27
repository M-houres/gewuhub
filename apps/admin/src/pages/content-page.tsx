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
  return date.toLocaleString();
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
      msgApi.error(error instanceof Error ? error.message : "Failed to load tutorials");
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
        msgApi.success("Tutorial updated");
      } else {
        await fetchJson("/api/v1/admin/content/tutorials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        msgApi.success("Tutorial created");
      }
      closeModal();
      await loadTutorials();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "Failed to save tutorial");
    } finally {
      setSaving(false);
    }
  };

  const removeTutorial = async (id: string) => {
    try {
      await fetchJson(`/api/v1/admin/content/tutorials/${id}`, {
        method: "DELETE",
      });
      msgApi.success("Tutorial deleted");
      await loadTutorials();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "Failed to delete tutorial");
    }
  };

  const columns: ColumnsType<TutorialRow> = [
    { title: "Title", dataIndex: "title", key: "title", width: 260 },
    { title: "Slug", dataIndex: "slug", key: "slug", width: 180 },
    { title: "Tag", dataIndex: "tag", key: "tag", width: 120 },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: TutorialStatus) => <Tag color={status === "published" ? "green" : "orange"}>{status}</Tag>,
    },
    {
      title: "Updated At",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: "Actions",
      key: "actions",
      width: 160,
      render: (_value, row) => (
        <Space>
          <Button size="small" onClick={() => openEditModal(row)}>
            Edit
          </Button>
          <Popconfirm title="Delete this tutorial?" onConfirm={() => void removeTutorial(row.id)}>
            <Button size="small" danger>
              Delete
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
        title="Tutorial Management"
        extra={
          <Space>
            <Button onClick={() => void loadTutorials()} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" onClick={openCreateModal}>
              New Tutorial
            </Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 1100 }} />
      </Card>

      <Modal
        title={editingRow ? `Edit Tutorial: ${editingRow.title}` : "Create Tutorial"}
        open={open}
        onCancel={closeModal}
        onOk={() => void submitTutorial()}
        confirmLoading={saving}
        width={760}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="Title" rules={[{ required: true, message: "Please enter title" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="slug" label="Slug (optional)">
            <Input placeholder="auto-generated from title when empty" />
          </Form.Item>
          <Form.Item name="tag" label="Tag" rules={[{ required: true, message: "Please enter tag" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="summary" label="Summary" rules={[{ required: true, message: "Please enter summary" }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="content" label="Content" rules={[{ required: true, message: "Please enter content" }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "draft", label: "draft" },
                { value: "published", label: "published" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
