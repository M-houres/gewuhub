import { Button, Card, Form, Input, InputNumber, Modal, Space, Switch, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

type ModelRow = {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  enabled: boolean;
  pointMultiplier: number;
  hasApiKey: boolean;
  keyUpdatedAt?: string;
};

type SetKeyResponse = {
  id: string;
  hasApiKey: boolean;
  keyUpdatedAt?: string;
};

const fallbackModels: ModelRow[] = [
  {
    id: "mdl-1",
    provider: "deepseek",
    modelId: "deepseek-v3",
    displayName: "DeepSeek-V3",
    enabled: true,
    pointMultiplier: 1,
    hasApiKey: false,
  },
];

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

export function ModelsPage() {
  const [models, setModels] = useState<ModelRow[]>(fallbackModels);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState<ModelRow | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [keyForm] = Form.useForm<{ apiKey: string }>();
  const [msgApi, contextHolder] = message.useMessage();

  const loadModels = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<ModelRow[]>("/api/v1/admin/models");
      setModels(data);
    } catch {
      msgApi.warning("加载模型列表失败，当前显示演示数据");
      setModels(fallbackModels);
    } finally {
      setLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const patchModel = async (id: string, patch: Partial<ModelRow>) => {
    setSavingId(id);
    try {
      setModels((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
      await fetchJson(`/api/v1/admin/models/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      msgApi.success("模型已更新");
    } catch {
      msgApi.error("模型更新失败，已回滚数据");
      void loadModels();
    } finally {
      setSavingId(null);
    }
  };

  const openSetKeyModal = (model: ModelRow) => {
    setEditingModel(model);
    keyForm.resetFields();
  };

  const closeSetKeyModal = () => {
    setEditingModel(null);
    keyForm.resetFields();
  };

  const submitApiKey = async () => {
    if (!editingModel) return;
    let values: { apiKey: string };
    try {
      values = await keyForm.validateFields();
    } catch {
      return;
    }

    try {
      setSavingKey(true);
      const result = await fetchJson<SetKeyResponse>(`/api/v1/admin/models/${editingModel.id}/api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: values.apiKey,
        }),
      });
      setModels((prev) =>
        prev.map((item) =>
          item.id === editingModel.id
            ? {
                ...item,
                hasApiKey: result.hasApiKey,
                keyUpdatedAt: result.keyUpdatedAt,
              }
            : item,
        ),
      );
      msgApi.success("API密钥已保存");
      closeSetKeyModal();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "保存API密钥失败");
    } finally {
      setSavingKey(false);
    }
  };

  const clearApiKey = async (model: ModelRow) => {
    setSavingId(model.id);
    try {
      const result = await fetchJson<SetKeyResponse>(`/api/v1/admin/models/${model.id}/api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clear: true,
        }),
      });
      setModels((prev) =>
        prev.map((item) =>
          item.id === model.id
            ? {
                ...item,
                hasApiKey: result.hasApiKey,
                keyUpdatedAt: result.keyUpdatedAt,
              }
            : item,
        ),
      );
      msgApi.success("API密钥已清除");
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "清除API密钥失败");
    } finally {
      setSavingId(null);
    }
  };

  const columns: ColumnsType<ModelRow> = [
    { title: "显示名称", dataIndex: "displayName", key: "displayName" },
    { title: "服务商", dataIndex: "provider", key: "provider", width: 120 },
    { title: "模型ID", dataIndex: "modelId", key: "modelId", width: 170 },
    {
      title: "API密钥",
      dataIndex: "hasApiKey",
      key: "hasApiKey",
      width: 120,
      render: (hasApiKey: boolean) => <Tag color={hasApiKey ? "green" : "orange"}>{hasApiKey ? "已配置" : "未配置"}</Tag>,
    },
    {
      title: "密钥更新时间",
      dataIndex: "keyUpdatedAt",
      key: "keyUpdatedAt",
      width: 170,
      render: (value?: string) => formatDateTime(value),
    },
    {
      title: "启用",
      dataIndex: "enabled",
      key: "enabled",
      width: 100,
      render: (_value, row) => (
        <Switch
          checked={row.enabled}
          loading={savingId === row.id}
          onChange={(checked) => {
            void patchModel(row.id, { enabled: checked });
          }}
        />
      ),
    },
    {
      title: "积分倍率",
      dataIndex: "pointMultiplier",
      key: "pointMultiplier",
      width: 130,
      render: (_value, row) => (
        <InputNumber
          min={0.1}
          step={0.1}
          value={row.pointMultiplier}
          onChange={(value) => {
            if (typeof value === "number") {
              void patchModel(row.id, { pointMultiplier: value });
            }
          }}
        />
      ),
    },
    {
      title: "操作",
      key: "action",
      width: 240,
      render: (_value, row) => (
        <Space>
          <Button size="small" onClick={() => openSetKeyModal(row)} loading={savingId === row.id || savingKey}>
            设置密钥
          </Button>
          <Button size="small" danger disabled={!row.hasApiKey} onClick={() => void clearApiKey(row)} loading={savingId === row.id}>
            清除密钥
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <Card
        title="模型管理"
        extra={
          <Button onClick={() => void loadModels()} loading={loading}>
            刷新
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={models} loading={loading} scroll={{ x: 1350 }} />
      </Card>

      <Modal
        title={editingModel ? `设置API密钥：${editingModel.displayName}` : "设置API密钥"}
        open={Boolean(editingModel)}
        onCancel={closeSetKeyModal}
        onOk={() => void submitApiKey()}
        confirmLoading={savingKey}
      >
        <Form form={keyForm} layout="vertical">
          <Form.Item
            name="apiKey"
            label="API密钥"
            rules={[
              { required: true, message: "请输入API密钥" },
              { min: 10, message: "API密钥至少10位" },
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="粘贴服务商API密钥" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}




