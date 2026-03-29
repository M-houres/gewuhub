import { Button, Card, Divider, Form, Input, InputNumber, Select, Space, Switch, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

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

type RewriteSlotSettings = {
  enabled: boolean;
  version: string;
  mode: TaskExecutionMode;
  fallbackToRulesOnModelError: boolean;
  protectedTerms: string[];
  replacements: Array<{ from: string; to: string }>;
  notes: string[];
};

type DetectSlotSettings = {
  enabled: boolean;
  version: string;
  mode: TaskExecutionMode;
  fallbackToRulesOnModelError: boolean;
  scoreOffset: number;
  phraseWeights: Array<{ phrase: string; weight: number }>;
  notes: string[];
};

type TaskMatrixSettings = {
  "reduce-repeat": Record<"cnki" | "weipu" | "paperpass" | "wanfang" | "daya", RewriteSlotSettings>;
  "reduce-ai": Record<"cnki" | "weipu" | "paperpass" | "wanfang" | "daya", RewriteSlotSettings>;
  detect: Record<"cnki" | "weipu" | "paperpass" | "wanfang" | "daya", DetectSlotSettings>;
};

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
  platformRegistry: Record<"cnki" | "weipu" | "paperpass" | "wanfang" | "daya", { enabled: boolean; order: number }>;
  execution: {
    rewrite: ExecutionPolicySettings;
    detect: ExecutionPolicySettings;
  };
  taskMatrix: TaskMatrixSettings;
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

type PlatformConfigRow = {
  code: "cnki" | "weipu" | "paperpass" | "wanfang" | "daya";
  label: string;
  enabled: boolean;
  order: number;
};

type PlatformConfigResponse = {
  items: PlatformConfigRow[];
};

type RulePackageRow = {
  taskType: "reduce-repeat" | "reduce-ai" | "detect";
  platform: "cnki" | "weipu" | "paperpass" | "wanfang" | "daya";
  platformLabel: string;
  enabled: boolean;
  mode: TaskExecutionMode;
  version: string;
  fallbackToRulesOnModelError: boolean;
  replacementCount?: number;
  protectedTermCount?: number;
  phraseWeightCount?: number;
  noteCount: number;
};

type RulePackageResponse = {
  items: RulePackageRow[];
};

const taskTypeLabel: Record<RulePackageRow["taskType"], string> = {
  "reduce-repeat": "降重",
  "reduce-ai": "降AIGC",
  detect: "AIGC检测",
};

const executionModeLabel: Record<TaskExecutionMode, string> = {
  rules_only: "规则驱动",
  hybrid: "混合驱动",
  llm_only: "纯模型",
};+  { label: "规则驱动", value: "rules_only" },
  { label: "混合驱动", value: "hybrid" },
  { label: "纯模型", value: "llm_only" },
];

const taskMatrixTasks = ["reduce-repeat", "reduce-ai", "detect"] as const;
const taskMatrixPlatforms = ["cnki", "weipu", "paperpass", "wanfang", "daya"] as const;
const executionModes = new Set<TaskExecutionMode>(["rules_only", "hybrid", "llm_only"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateTaskMatrixShape(value: unknown): string | null {
  if (!isRecord(value)) {
    return "任务矩阵必须是 JSON 对象。";
  }

  for (const task of taskMatrixTasks) {
    const taskSlots = value[task];
    if (!isRecord(taskSlots)) {
      return `任务 ${task} 缺失或无效。`;
    }

    for (const platform of taskMatrixPlatforms) {
      const slot = taskSlots[platform];
      if (!isRecord(slot)) {
        return `槽位 ${task}.${platform} 缺失或无效。`;
      }

      if (typeof slot.enabled !== "boolean") {
        return `槽位 ${task}.${platform}.enabled 必须是布尔值。`;
      }
      if (typeof slot.version !== "string" || slot.version.trim().length === 0) {
        return `槽位 ${task}.${platform}.version 必须是非空字符串。`;
      }
      if (!executionModes.has(slot.mode as TaskExecutionMode)) {
        return `槽位 ${task}.${platform}.mode 必须是 rules_only/hybrid/llm_only 之一。`;
      }
      if (typeof slot.fallbackToRulesOnModelError !== "boolean") {
        return `槽位 ${task}.${platform}.fallbackToRulesOnModelError 必须是布尔值。`;
      }

      if (task === "detect") {
        if (typeof slot.scoreOffset !== "number") {
          return `槽位 ${task}.${platform}.scoreOffset 必须是数字。`;
        }
        if (!Array.isArray(slot.phraseWeights)) {
          return `槽位 ${task}.${platform}.phraseWeights 必须是数组。`;
        }
      } else {
        if (!Array.isArray(slot.protectedTerms)) {
          return `槽位 ${task}.${platform}.protectedTerms 必须是数组。`;
        }
        if (!Array.isArray(slot.replacements)) {
          return `槽位 ${task}.${platform}.replacements 必须是数组。`;
        }
      }
    }
  }

  return null;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

export function SettingsPage() {
  const [form] = Form.useForm<SystemSettings>();
  const [loading, setLoading] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [emailLogLoading, setEmailLogLoading] = useState(false);
  const [savingNavKey, setSavingNavKey] = useState<string | null>(null);
  const [navItems, setNavItems] = useState<WorkbenchNavItem[]>([]);
  const [emailTransport, setEmailTransport] = useState<EmailTransportStatus | null>(null);
  const [emailLogs, setEmailLogs] = useState<EmailLogRow[]>([]);
  const [snapshot, setSnapshot] = useState<SystemSettings | null>(null);
  const [taskMatrixJson, setTaskMatrixJson] = useState("");
  const [platformConfigs, setPlatformConfigs] = useState<PlatformConfigRow[]>([]);
  const [platformSaving, setPlatformSaving] = useState(false);
  const [rulePackages, setRulePackages] = useState<RulePackageRow[]>([]);
  const [ruleLoading, setRuleLoading] = useState(false);
  const [ruleUploading, setRuleUploading] = useState(false);
  const [ruleFile, setRuleFile] = useState<File | null>(null);
  const [selectedRuleTaskType, setSelectedRuleTaskType] = useState<RulePackageRow["taskType"]>("reduce-ai");
  const [selectedRulePlatform, setSelectedRulePlatform] = useState<RulePackageRow["platform"]>("cnki");
  const [msgApi, contextHolder] = message.useMessage();

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<AdminSettingsResponse>("/api/v1/admin/settings");
      setSnapshot({
        siteName: data.siteName,
        smtpHost: data.smtpHost,
        checkinPoints: data.checkinPoints,
        algorithmEngine: data.algorithmEngine,
      });
      form.setFieldsValue({
        siteName: data.siteName,
        smtpHost: data.smtpHost,
        checkinPoints: data.checkinPoints,
        algorithmEngine: {
          execution: data.algorithmEngine.execution,
        } as SystemSettings["algorithmEngine"],
      });
      setTaskMatrixJson(JSON.stringify(data.algorithmEngine.taskMatrix, null, 2));
      setEmailTransport(data.emailTransport !== undefined ? data.emailTransport : null);
    } catch {
      msgApi.error("加载系统设置失败");
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
      msgApi.error("加载工作台导航失败");
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
      msgApi.error("加载邮件日志失败");
    } finally {
      setEmailLogLoading(false);
    }
  }, [msgApi]);

  const loadPlatformConfigs = useCallback(async () => {
    try {
      const data = await fetchJson<PlatformConfigResponse>("/api/v1/admin/platforms");
      setPlatformConfigs(data.items);
      if (data.items.length > 0 && !data.items.some((item) => item.code === selectedRulePlatform)) {
        setSelectedRulePlatform(data.items[0].code);
      }
    } catch {
      msgApi.error("加载平台配置失败");
    }
  }, [msgApi, selectedRulePlatform]);

  const loadRulePackages = useCallback(async () => {
    try {
      setRuleLoading(true);
      const data = await fetchJson<RulePackageResponse>("/api/v1/admin/rule-packages");
      setRulePackages(data.items);
    } catch {
      msgApi.error("加载规则包失败");
    } finally {
      setRuleLoading(false);
    }
  }, [msgApi]);

  const savePlatformConfigs = async () => {
    try {
      setPlatformSaving(true);
      const data = await fetchJson<PlatformConfigResponse>("/api/v1/admin/platforms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: platformConfigs }),
      });
      setPlatformConfigs(data.items);
      msgApi.success("平台配置已保存");
    } catch {
      msgApi.error("保存平台配置失败");
    } finally {
      setPlatformSaving(false);
    }
  };

  const uploadRulePackage = async () => {
    if (!ruleFile) {
      msgApi.error("请先选择规则包 JSON 文件");
      return;
    }

    try {
      setRuleUploading(true);
      const contentText = await ruleFile.text();
      await fetchJson("/api/v1/admin/rule-packages/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: selectedRuleTaskType,
          platform: selectedRulePlatform,
          fileName: ruleFile.name,
          content: contentText,
        }),
      });
      msgApi.success("规则包已上传并生效");
      setRuleFile(null);
      await loadRulePackages();
    } catch {
      msgApi.error("上传规则包失败");
    } finally {
      setRuleUploading(false);
    }
  };

  const resetRulePackage = async (taskType: RulePackageRow["taskType"], platform: RulePackageRow["platform"]) => {
    try {
      await fetchJson(`/api/v1/admin/rule-packages/${taskType}/${platform}/delete`, {
        method: "POST",
      });
      msgApi.success("已重置为默认规则包");
      await loadRulePackages();
    } catch {
      msgApi.error("重置规则包失败");
    }
  };

  useEffect(() => {
    void loadSettings();
    void loadWorkbenchNav();
    void loadEmailLogs();
    void loadPlatformConfigs();
    void loadRulePackages();
  }, [loadSettings, loadWorkbenchNav, loadEmailLogs, loadPlatformConfigs, loadRulePackages]);

  const onSave = () => {
    form.validateFields().then(async (values) => {
      if (!snapshot) {
        msgApi.error("设置快照不存在，请先刷新页面");
        return;
      }

      let parsedTaskMatrix: TaskMatrixSettings;
      try {
        parsedTaskMatrix = JSON.parse(taskMatrixJson) as TaskMatrixSettings;
      } catch {
        msgApi.error("任务矩阵 JSON 格式错误");
        return;
      }

      const matrixValidationError = validateTaskMatrixShape(parsedTaskMatrix);
      if (matrixValidationError) {
        msgApi.error(matrixValidationError);
        return;
      }

      const payload: SystemSettings = {
        siteName: values.siteName,
        smtpHost: values.smtpHost,
        checkinPoints: values.checkinPoints,
        algorithmEngine: {
          ...snapshot.algorithmEngine,
          execution: {
            rewrite: values.algorithmEngine.execution.rewrite,
            detect: values.algorithmEngine.execution.detect,
          },
          taskMatrix: parsedTaskMatrix,
        },
      };

      try {
        await fetchJson<SystemSettings>("/api/v1/admin/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        msgApi.success("系统设置已保存");
        setSnapshot(payload);
      } catch {
        msgApi.error("保存系统设置失败");
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
      msgApi.success(`${visible ? "已显示" : "已隐藏"}：${updated.label}`);
    } catch {
      msgApi.error("更新导航配置失败");
    } finally {
      setSavingNavKey(null);
    }
  };

  const navColumns: ColumnsType<WorkbenchNavItem> = [
    { title: "菜单", dataIndex: "label", key: "label" },
    { title: "路由", dataIndex: "href", key: "href" },
    {
      title: "状态",
      dataIndex: "visible",
      key: "visible-status",
      render: (visible: boolean) => <Tag color={visible ? "green" : "default"}>{visible ? "显示" : "隐藏"}</Tag>,
    },
    {
      title: "开关",
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

  const platformColumns: ColumnsType<PlatformConfigRow> = [
    { title: "平台", dataIndex: "label", key: "label" },
    { title: "代码", dataIndex: "code", key: "code", width: 120 },
    {
      title: "排序",
      dataIndex: "order",
      key: "order",
      width: 100,
      render: (_value, row) => (
        <InputNumber
          min={1}
          max={99}
          value={row.order}
          onChange={(next) => {
            const nextOrder = typeof next === "number" ? next : row.order;
            setPlatformConfigs((prev: PlatformConfigRow[]) => prev.map((item: PlatformConfigRow) => (item.code === row.code ? { ...item, order: nextOrder } : item)));
          }}
        />
      ),
    },
    {
      title: "启用",
      dataIndex: "enabled",
      key: "enabled",
      width: 100,
      render: (_value, row) => (
        <Switch
          checked={row.enabled}
          onChange={(checked) => {
            setPlatformConfigs((prev: PlatformConfigRow[]) => prev.map((item: PlatformConfigRow) => (item.code === row.code ? { ...item, enabled: checked } : item)));
          }}
        />
      ),
    },
  ];

  const rulePackageColumns: ColumnsType<RulePackageRow> = [
    {
      title: "任务",
      dataIndex: "taskType",
      key: "taskType",
      width: 110,
      render: (value: RulePackageRow["taskType"]) => taskTypeLabel[value],
    },
    { title: "平台", dataIndex: "platformLabel", key: "platformLabel", width: 120 },
    { title: "版本", dataIndex: "version", key: "version", width: 170 },
    {
      title: "模式",
      dataIndex: "mode",
      key: "mode",
      width: 100,
      render: (value: RulePackageRow["mode"]) => <Tag>{value}</Tag>,
    },
    {
      title: "规则条数",
      key: "count",
      width: 120,
      render: (_value, row) => (row.taskType === "detect" ? (row.phraseWeightCount || 0) : (row.replacementCount || 0)),
    },
    {
      title: "操作",
      key: "action",
      width: 110,
      render: (_value, row) => (
        <Button size="small" danger onClick={() => void resetRulePackage(row.taskType, row.platform)}>
          重置
        </Button>
      ),
    },
  ];

  const emailLogColumns: ColumnsType<EmailLogRow> = [
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    { title: "收件人", dataIndex: "to", key: "to", width: 220 },
    { title: "分类", dataIndex: "category", key: "category", width: 150 },
    { title: "主题", dataIndex: "subject", key: "subject", width: 220 },
    {
      title: "发送状态",
      dataIndex: "status",
      key: "status",
      width: 90,
      render: (value: EmailLogRow["status"]) => <Tag color={value === "sent" ? "green" : "red"}>{value === "sent" ? "成功" : "失败"}</Tag>,
    },
    {
      title: "渠道",
      dataIndex: "provider",
      key: "provider",
      width: 110,
      render: (value: EmailLogRow["provider"]) => <Tag color={value === "smtp" ? "blue" : "default"}>{value === "smtp" ? "SMTP" : "本地日志"}</Tag>,
    },
    {
      title: "错误信息",
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
        <Form.Item name={["algorithmEngine", "execution", target, "defaultMode"]} label="默认模式" rules={[{ required: true }]}>
          <Select options={executionModeOptions} />
        </Form.Item>
        <Form.Item
          name={["algorithmEngine", "execution", target, "fallbackToRulesOnModelError"]}
          label="模型失败时回退规则"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Form.Item name={["algorithmEngine", "execution", target, "platformModes", "cnki"]} label="知网" rules={[{ required: true }]}>
          <Select options={executionModeOptions} />
        </Form.Item>
        <Form.Item name={["algorithmEngine", "execution", target, "platformModes", "weipu"]} label="维普" rules={[{ required: true }]}>
          <Select options={executionModeOptions} />
        </Form.Item>
        <Form.Item name={["algorithmEngine", "execution", target, "platformModes", "paperpass"]} label="PaperPass" rules={[{ required: true }]}>
          <Select options={executionModeOptions} />
        </Form.Item>
        <Form.Item name={["algorithmEngine", "execution", target, "platformModes", "wanfang"]} label="万方" rules={[{ required: true }]}>
          <Select options={executionModeOptions} />
        </Form.Item>
        <Form.Item name={["algorithmEngine", "execution", target, "platformModes", "daya"]} label="大雅" rules={[{ required: true }]}>
          <Select options={executionModeOptions} />
        </Form.Item>
      </div>
    </>
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <Card
        title="系统设置"
        extra={
          <Button onClick={() => void loadSettings()} loading={loading}>
            刷新
          </Button>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="siteName" label="站点名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="smtpHost" label="SMTP 主机" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="checkinPoints" label="每日签到积分" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} min={1} />
          </Form.Item>

          <Divider orientation="left">执行策略</Divider>
          <Typography.Text type="secondary">配置改写与检测在不同平台下采用规则驱动、混合驱动或纯模型驱动。</Typography.Text>
          {renderExecutionPolicy("rewrite", "改写执行策略", "控制降重/降AIGC任务在不同平台下的执行模式。")}
          {renderExecutionPolicy("detect", "检测执行策略", "控制AIGC检测任务在不同平台下的执行模式。")}

          <Divider orientation="left">15 槽位任务矩阵</Divider>
          <Typography.Text type="secondary">配置降重/降AIGC/检测在知网、维普、PaperPass、万方、大雅的独立规则包。</Typography.Text>
          <Form.Item label="任务矩阵 JSON" style={{ marginTop: 12 }}>
            <Input.TextArea value={taskMatrixJson} onChange={(event) => setTaskMatrixJson(event.target.value)} autoSize={{ minRows: 18, maxRows: 32 }} />
          </Form.Item>

          <Button
            onClick={() => {
              try {
                setTaskMatrixJson(JSON.stringify(JSON.parse(taskMatrixJson), null, 2));
              } catch {
                msgApi.error("任务矩阵 JSON 格式错误");
              }
            }}
            style={{ marginBottom: 16 }}
          >
            格式化任务矩阵 JSON
          </Button>
          <Button type="primary" onClick={onSave}>
            保存设置
          </Button>
        </Form>

        <div style={{ marginTop: 16 }}>
          <Tag color={emailTransport?.configured ? "green" : "orange"}>邮件通道：{emailTransport?.configured ? "已配置" : "未配置"}</Tag>
          <Tag color="blue">渠道：{emailTransport?.provider === "smtp" ? "SMTP" : emailTransport?.provider === "dev-log" ? "本地日志" : "未知"}</Tag>
          <Tag>发件地址：{emailTransport?.fromEmail || "no-reply@gewu.local"}</Tag>
          {emailTransport?.host ? <Tag>主机：{emailTransport.host}:{emailTransport.port}</Tag> : null}
        </div>
      </Card>

      <Card
        title="平台开关（前台显示）"
        extra={
          <Space>
            <Button onClick={() => void loadPlatformConfigs()}>刷新</Button>
            <Button type="primary" loading={platformSaving} onClick={() => void savePlatformConfigs()}>
              保存平台配置
            </Button>
          </Space>
        }
      >
        <Typography.Text type="secondary">默认仅启用知网、维普。启用后前台会自动展示对应平台选项。</Typography.Text>
        <div style={{ marginTop: 12 }}>
          <Table rowKey="code" columns={platformColumns} dataSource={platformConfigs} pagination={false} />
        </div>
      </Card>

      <Card
        title="规则包管理（上传 / 替换 / 重置）"
        extra={
          <Button onClick={() => void loadRulePackages()} loading={ruleLoading}>
            刷新
          </Button>
        }
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Space wrap>
            <Select
              style={{ width: 160 }}
              value={selectedRuleTaskType}
              onChange={(value) => setSelectedRuleTaskType(value)}
              options={[
                { label: "降重", value: "reduce-repeat" },
                { label: "降AIGC", value: "reduce-ai" },
                { label: "AIGC检测", value: "detect" },
              ]}
            />
            <Select
              style={{ width: 160 }}
              value={selectedRulePlatform}
              onChange={(value) => setSelectedRulePlatform(value)}
              options={platformConfigs.map((item: PlatformConfigRow) => ({ label: item.label, value: item.code }))}
            />
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => setRuleFile(event.target.files?.[0] || null)}
            />
            <Button type="primary" loading={ruleUploading} onClick={() => void uploadRulePackage()}>
              上传并生效
            </Button>
          </Space>

          <Table
            rowKey={(row) => row.taskType + "-" + row.platform}
            columns={rulePackageColumns}
            dataSource={rulePackages}
            loading={ruleLoading}
            pagination={{ pageSize: 12 }}
          />
        </Space>
      </Card>

      <Card
        title="工作台导航开关"
        extra={
          <Button onClick={() => void loadWorkbenchNav()} loading={navLoading}>
            刷新
          </Button>
        }
      >
        <Table rowKey="key" columns={navColumns} dataSource={navItems} loading={navLoading} pagination={false} />
      </Card>

      <Card
        title="邮件发送日志"
        extra={
          <Button onClick={() => void loadEmailLogs()} loading={emailLogLoading}>
            刷新
          </Button>
        }
      >
        <Table rowKey="id" columns={emailLogColumns} dataSource={emailLogs} loading={emailLogLoading} pagination={{ pageSize: 20 }} scroll={{ x: 1100 }} />
      </Card>
    </Space>
  );
}











