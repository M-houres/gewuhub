import { Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

type PlanRow = {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  quota: number;
  features: string[];
};

type PlanFormValues = {
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  quota: number;
  featuresText: string;
};

function parseFeaturesText(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (lines.length > 0) return lines;
  return ["默认功能"];
}

function toFeaturesText(features: string[]) {
  if (!features.length) return "";
  return features.join("\n");
}

export function PlansPage() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<PlanFormValues>();
  const [msgApi, contextHolder] = message.useMessage();

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<PlanRow[]>("/api/v1/admin/plans");
      setPlans(data);
    } catch {
      msgApi.error("Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const columns: ColumnsType<PlanRow> = [
    { title: "Plan Name", dataIndex: "name", key: "name" },
    { title: "Monthly", dataIndex: "monthlyPrice", key: "monthlyPrice", width: 120, render: (value) => `CNY ${value}` },
    { title: "Yearly", dataIndex: "yearlyPrice", key: "yearlyPrice", width: 120, render: (value) => `CNY ${value}` },
    { title: "Quota (chars)", dataIndex: "quota", key: "quota", width: 140 },
    {
      title: "Features",
      dataIndex: "features",
      key: "features",
      render: (features: string[]) => (
        <Space size={[4, 4]} wrap>
          {features.map((item) => (
            <Tag key={item}>{item}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 160,
      render: (_value, row) => (
        <Space>
          <Button size="small" onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Popconfirm title="Delete this plan?" onConfirm={() => void removePlan(row.id)}>
            <Button size="small" danger>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const openCreate = () => {
    setEditingPlan(null);
    form.setFieldsValue({
      name: "",
      monthlyPrice: 0,
      yearlyPrice: 0,
      quota: 0,
      featuresText: "",
    });
    setOpen(true);
  };

  const openEdit = (row: PlanRow) => {
    setEditingPlan(row);
    form.setFieldsValue({
      name: row.name,
      monthlyPrice: row.monthlyPrice,
      yearlyPrice: row.yearlyPrice,
      quota: row.quota,
      featuresText: toFeaturesText(row.features),
    });
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditingPlan(null);
    form.resetFields();
  };

  const submitPlan = async () => {
    let values: PlanFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: values.name,
        monthlyPrice: values.monthlyPrice,
        yearlyPrice: values.yearlyPrice,
        quota: values.quota,
        features: parseFeaturesText(values.featuresText),
      };

      if (editingPlan) {
        await fetchJson(`/api/v1/admin/plans/${editingPlan.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        msgApi.success("Plan updated");
      } else {
        await fetchJson("/api/v1/admin/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        msgApi.success("Plan created");
      }

      closeModal();
      await loadPlans();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "Failed to save plan");
    } finally {
      setSaving(false);
    }
  };

  const removePlan = async (planId: string) => {
    try {
      await fetchJson(`/api/v1/admin/plans/${planId}`, {
        method: "DELETE",
      });
      msgApi.success("Plan deleted");
      await loadPlans();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "Failed to delete plan");
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <Card
        title="Plan Management"
        extra={
          <Space>
            <Button onClick={() => void loadPlans()} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" onClick={openCreate}>
              Add Plan
            </Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={plans} loading={loading} scroll={{ x: 1200 }} />
      </Card>

      <Modal
        title={editingPlan ? `Edit Plan: ${editingPlan.name}` : "Create Plan"}
        open={open}
        onCancel={closeModal}
        onOk={() => void submitPlan()}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Please enter plan name" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="monthlyPrice" label="Monthly Price (CNY)" rules={[{ required: true, message: "Required" }]}>
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item name="yearlyPrice" label="Yearly Price (CNY)" rules={[{ required: true, message: "Required" }]}>
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item name="quota" label="Quota (chars)" rules={[{ required: true, message: "Required" }]}>
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item
            name="featuresText"
            label="Features (one per line)"
            rules={[{ required: true, message: "Please provide at least one feature" }]}
          >
            <Input.TextArea rows={6} placeholder={"例如：\n降重与降AIGC\n文献综述基础模板"} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
