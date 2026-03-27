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
  return date.toLocaleString();
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
      msgApi.warning("Failed to load model list, fallback demo data is shown");
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
      msgApi.success("Model updated");
    } catch {
      msgApi.error("Failed to update model, data has been rolled back");
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
      msgApi.success("API key saved");
      closeSetKeyModal();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "Failed to save API key");
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
      msgApi.success("API key cleared");
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "Failed to clear API key");
    } finally {
      setSavingId(null);
    }
  };

  const columns: ColumnsType<ModelRow> = [
    { title: "Display Name", dataIndex: "displayName", key: "displayName" },
    { title: "Provider", dataIndex: "provider", key: "provider", width: 120 },
    { title: "Model ID", dataIndex: "modelId", key: "modelId", width: 170 },
    {
      title: "API Key",
      dataIndex: "hasApiKey",
      key: "hasApiKey",
      width: 120,
      render: (hasApiKey: boolean) => <Tag color={hasApiKey ? "green" : "orange"}>{hasApiKey ? "Configured" : "Missing"}</Tag>,
    },
    {
      title: "Key Updated",
      dataIndex: "keyUpdatedAt",
      key: "keyUpdatedAt",
      width: 170,
      render: (value?: string) => formatDateTime(value),
    },
    {
      title: "Enabled",
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
      title: "Point Multiplier",
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
      title: "Action",
      key: "action",
      width: 240,
      render: (_value, row) => (
        <Space>
          <Button size="small" onClick={() => openSetKeyModal(row)} loading={savingId === row.id || savingKey}>
            Set Key
          </Button>
          <Button size="small" danger disabled={!row.hasApiKey} onClick={() => void clearApiKey(row)} loading={savingId === row.id}>
            Clear Key
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <Card
        title="Model Management"
        extra={
          <Button onClick={() => void loadModels()} loading={loading}>
            Refresh
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={models} loading={loading} scroll={{ x: 1350 }} />
      </Card>

      <Modal
        title={editingModel ? `Set API Key: ${editingModel.displayName}` : "Set API Key"}
        open={Boolean(editingModel)}
        onCancel={closeSetKeyModal}
        onOk={() => void submitApiKey()}
        confirmLoading={savingKey}
      >
        <Form form={keyForm} layout="vertical">
          <Form.Item
            name="apiKey"
            label="API Key"
            rules={[
              { required: true, message: "Please enter API key" },
              { min: 10, message: "API key must be at least 10 characters" },
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="Paste provider API key" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
