import { Area, Column } from "@ant-design/charts";
import { Button, Card, Col, Row, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";
import { useAdminLocale } from "../lib/locale";

type TaskTrendPoint = {
  day: string;
  count: number;
};

type CostTrendPoint = {
  day: string;
  points: number;
  cny: number;
};

type ModelUsageRow = {
  model: string;
  count: number;
  pointsCost: number;
  cny: number;
};

type RecentTaskRow = {
  id: string;
  userId: string;
  status: "queued" | "running" | "completed" | "failed";
  model: string;
  pointsCost: number;
  createdAt: string;
};

type DashboardPayload = {
  newUsersToday: number;
  taskCount: number;
  income: number;
  modelCalls: number;
  totalIncome: number;
  activeUsers: number;
  taskStatusBreakdown: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
  };
  taskTrend: TaskTrendPoint[];
  costTrend: CostTrendPoint[];
  modelUsage: ModelUsageRow[];
  recentTasks: RecentTaskRow[];
};

const fallbackPayload: DashboardPayload = {
  newUsersToday: 0,
  taskCount: 0,
  income: 0,
  modelCalls: 0,
  totalIncome: 0,
  activeUsers: 0,
  taskStatusBreakdown: {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
  },
  taskTrend: [],
  costTrend: [],
  modelUsage: [],
  recentTasks: [],
};

function formatDateTime(value: string, locale: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString(locale);
}

function statusTagColor(status: RecentTaskRow["status"]) {
  if (status === "completed") return "green";
  if (status === "running") return "blue";
  if (status === "failed") return "red";
  return "default";
}

export function DashboardPage() {
  const { locale, pick } = useAdminLocale();
  const [data, setData] = useState<DashboardPayload>(fallbackPayload);
  const [loading, setLoading] = useState(false);
  const [msgApi, contextHolder] = message.useMessage();

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const payload = await fetchJson<DashboardPayload>("/api/v1/admin/dashboard");
      setData(payload);
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : pick("加载仪表盘失败", "Failed to load dashboard"));
    } finally {
      setLoading(false);
    }
  }, [msgApi, pick]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const recentTaskColumns: ColumnsType<RecentTaskRow> = [
    { title: pick("任务 ID", "Task ID"), dataIndex: "id", key: "id", width: 170 },
    { title: pick("用户", "User"), dataIndex: "userId", key: "userId", width: 140 },
    {
      title: pick("状态", "Status"),
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: RecentTaskRow["status"]) => (
        <Tag color={statusTagColor(status)}>
          {status === "queued"
            ? pick("排队中", "Queued")
            : status === "running"
              ? pick("运行中", "Running")
              : status === "completed"
                ? pick("已完成", "Completed")
                : pick("失败", "Failed")}
        </Tag>
      ),
    },
    { title: pick("模型", "Model"), dataIndex: "model", key: "model", width: 180 },
    { title: pick("积分", "Points"), dataIndex: "pointsCost", key: "pointsCost", width: 90 },
    {
      title: pick("创建时间", "Created At"),
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (value: string) => formatDateTime(value, locale),
    },
  ];

  const modelUsageColumns: ColumnsType<ModelUsageRow> = [
    { title: pick("模型", "Model"), dataIndex: "model", key: "model" },
    { title: pick("调用次数", "Calls"), dataIndex: "count", key: "count", width: 90 },
    { title: pick("积分消耗", "Points"), dataIndex: "pointsCost", key: "pointsCost", width: 110 },
    {
      title: pick("预估成本", "Est. CNY"),
      dataIndex: "cny",
      key: "cny",
      width: 120,
      render: (value: number) => pick(`¥ ${value.toFixed(2)}`, `CNY ${value.toFixed(2)}`),
    },
  ];

  const statusData = [
    { status: pick("排队中", "Queued"), value: data.taskStatusBreakdown.queued },
    { status: pick("运行中", "Running"), value: data.taskStatusBreakdown.running },
    { status: pick("已完成", "Completed"), value: data.taskStatusBreakdown.completed },
    { status: pick("失败", "Failed"), value: data.taskStatusBreakdown.failed },
  ];

  return (
    <>
      {contextHolder}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div className="text-sm text-[#6f7aa8]">{pick("今日新增用户", "New Users (Today)")}</div>
            <div className="mt-1 text-3xl font-semibold text-[#27357a]">{data.newUsersToday}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div className="text-sm text-[#6f7aa8]">{pick("今日任务量", "Tasks (Today)")}</div>
            <div className="mt-1 text-3xl font-semibold text-[#27357a]">{data.taskCount}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div className="text-sm text-[#6f7aa8]">{pick("今日收入", "Income (Today)")}</div>
            <div className="mt-1 text-3xl font-semibold text-[#27357a]">{pick(`¥ ${data.income.toFixed(2)}`, `CNY ${data.income.toFixed(2)}`)}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div className="text-sm text-[#6f7aa8]">{pick("今日模型调用", "Model Calls (Today)")}</div>
            <div className="mt-1 text-3xl font-semibold text-[#27357a]">{data.modelCalls}</div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div className="text-sm text-[#6f7aa8]">{pick("今日活跃用户", "Active Users (Today)")}</div>
            <div className="mt-1 text-3xl font-semibold text-[#27357a]">{data.activeUsers}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div className="text-sm text-[#6f7aa8]">{pick("累计收入", "Total Income")}</div>
            <div className="mt-1 text-3xl font-semibold text-[#27357a]">{pick(`¥ ${data.totalIncome.toFixed(2)}`, `CNY ${data.totalIncome.toFixed(2)}`)}</div>
          </Card>
        </Col>
        <Col xs={24} sm={24} lg={12}>
          <Card
            title={pick("任务状态分布", "Task Status Breakdown")}
            extra={
              <Button onClick={() => void loadDashboard()} loading={loading}>
                {pick("刷新", "Refresh")}
              </Button>
            }
          >
            <Column data={statusData} xField="status" yField="value" height={220} label={false} />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={pick("近 7 日任务趋势", "7-Day Task Trend")}>
            <Area data={data.taskTrend} xField="day" yField="count" height={260} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={pick("近 7 日预估成本", "7-Day Estimated Cost (CNY)")}>
            <Area data={data.costTrend} xField="day" yField="cny" height={260} />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title={pick("模型调用排行", "Top Models by Calls")}>
            <Table
              rowKey="model"
              columns={modelUsageColumns}
              dataSource={data.modelUsage}
              pagination={false}
              size="small"
              scroll={{ y: 320 }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title={pick("最近任务", "Recent Tasks")}>
            <Table
              rowKey="id"
              columns={recentTaskColumns}
              dataSource={data.recentTasks}
              pagination={false}
              size="small"
              scroll={{ x: 860, y: 320 }}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
