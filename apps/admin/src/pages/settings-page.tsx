import { Button, Card, Divider, Form, Input, InputNumber, Select, Space, Switch, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

type AlgorithmEngineSettings = {
  rewrite: {
    shortSentenceExpandThreshold: number;
    reorderAlternatingSentences: boolean;
    appendEvidenceTailOnReduceAi: boolean;
    maxSentenceCount: number;
  };
  detect: {
    dailyFreeLimit: number;
    baseScore: number;
    genericPhraseWeight: number;
    connectorWeight: number;
    citationMissingPenalty: number;
    lowDiversityThreshold: number;
    lowDiversityPenalty: number;
    uniformSentencePenalty: number;
    mediumRiskThreshold: number;
    highRiskThreshold: number;
  };
  longform: {
    defaultWordCount: number;
    maxWordCount: number;
    maxSections: number;
    includeModelAttribution: boolean;
    includeEvidenceReminder: boolean;
  };
  points: {
    detectCharsPerPoint: number;
    rewriteMinCost: number;
    reduceAiCostMultiplier: number;
    longformCharFactor: number;
    formatBaseCost: number;
  };
  execution: {
    rewrite: ExecutionPolicySettings;
    detect: ExecutionPolicySettings;
  };
};

type TaskExecutionMode = "rules_only" | "hybrid" | "llm_only";

type ExecutionPolicySettings = {
  defaultMode: TaskExecutionMode;
  fallbackToRulesOnModelError: boolean;
  platformModes: {
    cnki: TaskExecutionMode;
    weipu: TaskExecutionMode;
    paperpass: TaskExecutionMode;
    wanfang: TaskExecutionMode;
    daya: TaskExecutionMode;
  };
};

type SystemSettings = {
  siteName: string;
  smtpHost: string;
  checkinPoints: number;
  algorithmEngine: AlgorithmEngineSettings;
};

type EmailTransportStatus = {
  configured: boolean;
  provider: "smtp" | "dev-log";
  host: string | null;
  port: number;
  fromEmail: string;
  fromName: string | null;
};

type AdminSettingsResponse = SystemSettings & {
  emailTransport?: EmailTransportStatus;
};

type WorkbenchNavItem = {
  key: string;
  href: string;
  label: string;
  visible: boolean;
  order: number;
};

type EmailLogRow = {
  id: string;
  userId?: string;
  to: string;
  subject: string;
  category: string;
  status: "sent" | "failed";
  provider: "smtp" | "dev-log";
  messageId?: string;
  error?: string;
  createdAt: string;
};

const executionModeOptions = [
  { label: "rules_only", value: "rules_only" },
  { label: "hybrid", value: "hybrid" },
  { label: "llm_only", value: "llm_only" },
];

export function SettingsPage() {
  const [form] = Form.useForm<SystemSettings>();
  const [loading, setLoading] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [emailLogLoading, setEmailLogLoading] = useState(false);
  const [savingNavKey, setSavingNavKey] = useState<string | null>(null);
  const [navItems, setNavItems] = useState<WorkbenchNavItem[]>([]);
  const [emailTransport, setEmailTransport] = useState<EmailTransportStatus | null>(null);
  const [emailLogs, setEmailLogs] = useState<EmailLogRow[]>([]);
  const [msgApi, contextHolder] = message.useMessage();

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<AdminSettingsResponse>("/api/v1/admin/settings");
      form.setFieldsValue(data);
      setEmailTransport(data.emailTransport ?? null);
    } catch {
      msgApi.error("Failed to load system settings");
    } finally {
      setLoading(false);
    }
  }, [form, msgApi]);

  const loadWorkbenchNav = useCallback(async () => {
    try {
      setNavLoading(true);
      const data = await fetchJson<WorkbenchNavItem[]>("/api/v1/admin/workbench-nav");
      setNavItems(data);
    } catch {
      msgApi.error("Failed to load workbench navigation config");
    } finally {
      setNavLoading(false);
    }
  }, [msgApi]);

  const loadEmailLogs = useCallback(async () => {
    try {
      setEmailLogLoading(true);
      const data = await fetchJson<EmailLogRow[]>("/api/v1/admin/email-logs?limit=80");
      setEmailLogs(data);
    } catch {
      msgApi.error("Failed to load email logs");
    } finally {
      setEmailLogLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    void loadSettings();
    void loadWorkbenchNav();
    void loadEmailLogs();
  }, [loadSettings, loadWorkbenchNav, loadEmailLogs]);

  const onSave = () => {
    form.validateFields().then(async (values) => {
      try {
        await fetchJson<SystemSettings>("/api/v1/admin/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        msgApi.success("System settings saved");
      } catch {
        msgApi.error("Failed to save system settings");
      }
    });
  };

  const onToggleWorkbenchNav = async (key: string, visible: boolean) => {
    setSavingNavKey(key);
    try {
      const updated = await fetchJson<WorkbenchNavItem>(`/api/v1/admin/workbench-nav/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible }),
      });
      setNavItems((prev) => prev.map((item) => (item.key === updated.key ? updated : item)));
      msgApi.success(`${visible ? "Shown" : "Hidden"}: ${updated.label}`);
    } catch {
      msgApi.error("Failed to update navigation config");
    } finally {
      setSavingNavKey(null);
    }
  };

  const navColumns: ColumnsType<WorkbenchNavItem> = [
    { title: "Menu", dataIndex: "label", key: "label" },
    { title: "Route", dataIndex: "href", key: "href" },
    {
      title: "Status",
      dataIndex: "visible",
      key: "visible-status",
      render: (visible: boolean) => <Tag color={visible ? "green" : "default"}>{visible ? "Visible" : "Hidden"}</Tag>,
    },
    {
      title: "Toggle",
      dataIndex: "visible",
      key: "visible-action",
      render: (_visible, row) => (
        <Switch
          checked={row.visible}
          loading={savingNavKey === row.key}
          onChange={(checked) => {
            void onToggleWorkbenchNav(row.key, checked);
          }}
        />
      ),
    },
  ];

  const emailLogColumns: ColumnsType<EmailLogRow> = [
    {
      title: "Time",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (value: string) => {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return value;
        return date.toLocaleString();
      },
    },
    { title: "To", dataIndex: "to", key: "to", width: 220 },
    { title: "Category", dataIndex: "category", key: "category", width: 150 },
    { title: "Subject", dataIndex: "subject", key: "subject", width: 220 },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 90,
      render: (value: EmailLogRow["status"]) => <Tag color={value === "sent" ? "green" : "red"}>{value}</Tag>,
    },
    {
      title: "Provider",
      dataIndex: "provider",
      key: "provider",
      width: 110,
      render: (value: EmailLogRow["provider"]) => <Tag color={value === "smtp" ? "blue" : "default"}>{value}</Tag>,
    },
    {
      title: "Error",
      dataIndex: "error",
      key: "error",
      render: (value?: string) => value || "-",
    },
  ];

  const renderExecutionPolicy = (target: "rewrite" | "detect", title: string, description: string) => (
    <>
      <Divider orientation="left" plain>
        {title}
      </Divider>
      <Typography.Text type="secondary">{description}</Typography.Text>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: 16 }}>
        <Form.Item
          name={["algorithmEngine", "execution", target, "defaultMode"]}
          label="Default Mode"
          rules={[{ required: true }]}
        >
          <Select options={executionModeOptions} />
        </Form.Item>
        <Form.Item
          name={["algorithmEngine", "execution", target, "fallbackToRulesOnModelError"]}
          label="Fallback To Rules On Model Error"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name={["algorithmEngine", "execution", target, "platformModes", "cnki"]}
          label="CNKI"
          rules={[{ required: true }]}
        >
          <Select options={executionModeOptions} />
        </Form.Item>
        <Form.Item
          name={["algorithmEngine", "execution", target, "platformModes", "weipu"]}
          label="Weipu"
          rules={[{ required: true }]}
        >
          <Select options={executionModeOptions} />
        </Form.Item>
        <Form.Item
          name={["algorithmEngine", "execution", target, "platformModes", "paperpass"]}
          label="PaperPass"
          rules={[{ required: true }]}
        >
          <Select options={executionModeOptions} />
        </Form.Item>
        <Form.Item
          name={["algorithmEngine", "execution", target, "platformModes", "wanfang"]}
          label="Wanfang"
          rules={[{ required: true }]}
        >
          <Select options={executionModeOptions} />
        </Form.Item>
        <Form.Item
          name={["algorithmEngine", "execution", target, "platformModes", "daya"]}
          label="Daya"
          rules={[{ required: true }]}
        >
          <Select options={executionModeOptions} />
        </Form.Item>
      </div>
    </>
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <Card
        title="Website Settings"
        extra={
          <Button onClick={() => void loadSettings()} loading={loading}>
            Refresh
          </Button>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="siteName" label="Site Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="smtpHost" label="SMTP Host" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="checkinPoints" label="Daily Check-in Points" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} min={1} />
          </Form.Item>
          <Divider orientation="left">Algorithm Engine</Divider>
          <Typography.Text type="secondary">
            These settings drive the current local rewrite, detection, longform, and point-estimation strategies before real model adapters are wired in.
          </Typography.Text>

          <Divider orientation="left" plain>
            Rewrite
          </Divider>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Form.Item
              name={["algorithmEngine", "rewrite", "shortSentenceExpandThreshold"]}
              label="Short Sentence Expand Threshold"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: "100%" }} min={8} max={200} />
            </Form.Item>
            <Form.Item
              name={["algorithmEngine", "rewrite", "maxSentenceCount"]}
              label="Max Sentence Count"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: "100%" }} min={1} max={200} />
            </Form.Item>
            <Form.Item
              name={["algorithmEngine", "rewrite", "reorderAlternatingSentences"]}
              label="Reorder Alternating Sentences"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name={["algorithmEngine", "rewrite", "appendEvidenceTailOnReduceAi"]}
              label="Append Evidence Tail On Reduce-AI"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </div>

          <Divider orientation="left" plain>
            Detect
          </Divider>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Form.Item name={["algorithmEngine", "detect", "dailyFreeLimit"]} label="Daily Free Detect Limit" rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={0} max={50} />
            </Form.Item>
            <Form.Item name={["algorithmEngine", "detect", "baseScore"]} label="Base Score" rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={0} max={80} />
            </Form.Item>
            <Form.Item name={["algorithmEngine", "detect", "genericPhraseWeight"]} label="Generic Phrase Weight" rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={0} max={20} />
            </Form.Item>
            <Form.Item name={["algorithmEngine", "detect", "connectorWeight"]} label="Connector Weight" rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={0} max={20} />
            </Form.Item>
            <Form.Item
              name={["algorithmEngine", "detect", "citationMissingPenalty"]}
              label="Citation Missing Penalty"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: "100%" }} min={0} max={40} />
            </Form.Item>
            <Form.Item
              name={["algorithmEngine", "detect", "lowDiversityThreshold"]}
              label="Low Diversity Threshold"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: "100%" }} min={0.1} max={1} step={0.01} />
            </Form.Item>
            <Form.Item
              name={["algorithmEngine", "detect", "lowDiversityPenalty"]}
              label="Low Diversity Penalty"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: "100%" }} min={0} max={40} />
            </Form.Item>
            <Form.Item
              name={["algorithmEngine", "detect", "uniformSentencePenalty"]}
              label="Uniform Sentence Penalty"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: "100%" }} min={0} max={30} />
            </Form.Item>
            <Form.Item
              name={["algorithmEngine", "detect", "mediumRiskThreshold"]}
              label="Medium Risk Threshold"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: "100%" }} min={0} max={100} />
            </Form.Item>
            <Form.Item
              name={["algorithmEngine", "detect", "highRiskThreshold"]}
              label="High Risk Threshold"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: "100%" }} min={0} max={100} />
            </Form.Item>
          </div>

          <Divider orientation="left" plain>
            Longform
          </Divider>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Form.Item name={["algorithmEngine", "longform", "defaultWordCount"]} label="Default Word Count" rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={1000} max={10000} step={100} />
            </Form.Item>
            <Form.Item name={["algorithmEngine", "longform", "maxWordCount"]} label="Max Word Count" rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={1000} max={20000} step={100} />
            </Form.Item>
            <Form.Item name={["algorithmEngine", "longform", "maxSections"]} label="Max Sections" rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={3} max={10} />
            </Form.Item>
            <Form.Item
              name={["algorithmEngine", "longform", "includeModelAttribution"]}
              label="Include Model Attribution"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name={["algorithmEngine", "longform", "includeEvidenceReminder"]}
              label="Include Evidence Reminder"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </div>

          <Divider orientation="left" plain>
            Point Estimation
          </Divider>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Form.Item name={["algorithmEngine", "points", "detectCharsPerPoint"]} label="Detect Chars Per Point" rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={1} max={200} />
            </Form.Item>
            <Form.Item name={["algorithmEngine", "points", "rewriteMinCost"]} label="Rewrite Min Cost" rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={1} max={500} />
            </Form.Item>
            <Form.Item
              name={["algorithmEngine", "points", "reduceAiCostMultiplier"]}
              label="Reduce-AI Cost Multiplier"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: "100%" }} min={0.5} max={3} step={0.01} />
            </Form.Item>
            <Form.Item name={["algorithmEngine", "points", "longformCharFactor"]} label="Longform Char Factor" rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={1} max={100} step={0.1} />
            </Form.Item>
            <Form.Item name={["algorithmEngine", "points", "formatBaseCost"]} label="Format Base Cost" rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={50} max={5000} />
            </Form.Item>
          </div>

          <Divider orientation="left">Execution Strategy</Divider>
          <Typography.Text type="secondary">
            These policies decide whether rewrite and detect tasks stay rules-only or switch to hybrid / llm-only once real provider adapters are enabled. Until then, the backend resolves safely to the local rules engine.
          </Typography.Text>
          {renderExecutionPolicy(
            "rewrite",
            "Rewrite Execution",
            "Shared by 降重 and 降AIGC. Platform overrides let each academic platform keep its own execution policy.",
          )}
          {renderExecutionPolicy(
            "detect",
            "Detect Execution",
            "Controls AIGC detection routing. PaperPass can later move to hybrid independently of the other platforms.",
          )}
          <Button type="primary" onClick={onSave}>
            Save Settings
          </Button>
        </Form>
        <div style={{ marginTop: 16 }}>
          <Tag color={emailTransport?.configured ? "green" : "orange"}>
            Email Transport: {emailTransport?.configured ? "Configured" : "Fallback dev-log"}
          </Tag>
          <Tag color="blue">Provider: {emailTransport?.provider ?? "unknown"}</Tag>
          <Tag>From: {emailTransport?.fromEmail ?? "no-reply@gewu.local"}</Tag>
          {emailTransport?.host ? <Tag>Host: {emailTransport.host}:{emailTransport.port}</Tag> : null}
        </div>
      </Card>

      <Card
        title="Workbench Navigation Control"
        extra={
          <Button onClick={() => void loadWorkbenchNav()} loading={navLoading}>
            Refresh
          </Button>
        }
      >
        <Table rowKey="key" columns={navColumns} dataSource={navItems} loading={navLoading} pagination={false} />
      </Card>

      <Card
        title="Email Delivery Logs"
        extra={
          <Button onClick={() => void loadEmailLogs()} loading={emailLogLoading}>
            Refresh
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={emailLogColumns}
          dataSource={emailLogs}
          loading={emailLogLoading}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 1100 }}
        />
      </Card>
    </Space>
  );
}
