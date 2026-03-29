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
      msgApi.error("加载套餐失败");
    } finally {
      setLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const columns: ColumnsType<PlanRow> = [
    { title: "套餐名称", dataIndex: "name", key: "name" },
    { title: "月付", dataIndex: "monthlyPrice", key: "monthlyPrice", width: 120, render: (value) => `¥ ${value}` },
    { title: "年付", dataIndex: "yearlyPrice", key: "yearlyPrice", width: 120, render: (value) => `¥ ${value}` },
    { title: "字数额度", dataIndex: "quota", key: "quota", width: 140 },
    {
      title: "功能",
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
      title: "操作",
      key: "actions",
      width: 160,
      render: (_value, row) => (
        <Space>
          <Button size="small" onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Popconfirm title="确认删除该套餐？" onConfirm={() => void removePlan(row.id)}>
            <Button size="small" danger>
              删除
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
        msgApi.success("套餐已更新");
      } else {
        await fetchJson("/api/v1/admin/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        msgApi.success("套餐已创建");
      }

      closeModal();
      await loadPlans();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "保存套餐失败");
    } finally {
      setSaving(false);
    }
  };

  const removePlan = async (planId: string) => {
    try {
      await fetchJson(`/api/v1/admin/plans/${planId}`, {
        method: "DELETE",
      });
      msgApi.success("套餐已删除");
      await loadPlans();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "删除套餐失败");
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <Card
        title="套餐管理"
        extra={
          <Space>
            <Button onClick={() => void loadPlans()} loading={loading}>
              刷新
            </Button>
            <Button type="primary" onClick={openCreate}>
              新增套餐
            </Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={plans} loading={loading} scroll={{ x: 1200 }} />
      </Card>

      <Modal
        title={editingPlan ? `编辑套餐：${editingPlan.name}` : "创建套餐"}
        open={open}
        onCancel={closeModal}
        onOk={() => void submitPlan()}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入套餐名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="monthlyPrice" label="月付价格（CNY）" rules={[{ required: true, message: "必填项" }]}>
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item name="yearlyPrice" label="年付价格（CNY）" rules={[{ required: true, message: "必填项" }]}>
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item name="quota" label="字数额度" rules={[{ required: true, message: "必填项" }]}>
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item
            name="featuresText"
            label="功能说明（每行一个）"
            rules={[{ required: true, message: "请至少填写一个功能" }]}
          >
            <Input.TextArea rows={6} placeholder={"例如：\n降重与降AIGC\n文献综述基础模板"} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}


