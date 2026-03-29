import { Area, Column } from "@ant-design/charts";
import { Button, Card, Col, Row, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

function statusTagColor(status: RecentTaskRow["status"]) {
  if (status === "completed") return "green";
  if (status === "running") return "blue";
  if (status === "failed") return "red";
  return "default";
}

function statusLabel(status: RecentTaskRow["status"]) {
  if (status === "queued") return "排队中";
  if (status === "running") return "运行中";
  if (status === "completed") return "已完成";
  return "失败";
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardPayload>(fallbackPayload);
  const [loading, setLoading] = useState(false);
  const [msgApi, contextHolder] = message.useMessage();

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const payload = await fetchJson<DashboardPayload>("/api/v1/admin/dashboard");
      setData(payload);
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "加载仪表盘失败");
    } finally {
      setLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const recentTaskColumns: ColumnsType<RecentTaskRow> = [
    { title: "任务ID", dataIndex: "id", key: "id", width: 170 },
    { title: "用户", dataIndex: "userId", key: "userId", width: 140 },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: RecentTaskRow["status"]) => <Tag color={statusTagColor(status)}>{statusLabel(status)}</Tag>,
    },
    { title: "模型", dataIndex: "model", key: "model", width: 180 },
    { title: "积分", dataIndex: "pointsCost", key: "pointsCost", width: 90 },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
  ];

  const modelUsageColumns: ColumnsType<ModelUsageRow> = [
    { title: "模型", dataIndex: "model", key: "model" },
    { title: "调用次数", dataIndex: "count", key: "count", width: 90 },
    { title: "积分消耗", dataIndex: "pointsCost", key: "pointsCost", width: 110 },
    {
      title: "预估成本",
      dataIndex: "cny",
      key: "cny",
      width: 120,
      render: (value: number) => `¥ ${value.toFixed(2)}`,
    },
  ];

  const statusData = [
    { status: "排队中", value: data.taskStatusBreakdown.queued },
    { status: "运行中", value: data.taskStatusBreakdown.running },
    { status: "已完成", value: data.taskStatusBreakdown.completed },
    { status: "失败", value: data.taskStatusBreakdown.failed },
  ];

  return (
    <>
      {contextHolder}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div className="text-sm text-[#6f7aa8]">今日新增用户</div>
            <div className="mt-1 text-3xl font-semibold text-[#27357a]">{data.newUsersToday}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div className="text-sm text-[#6f7aa8]">今日任务量</div>
            <div className="mt-1 text-3xl font-semibold text-[#27357a]">{data.taskCount}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div className="text-sm text-[#6f7aa8]">今日收入</div>
            <div className="mt-1 text-3xl font-semibold text-[#27357a]">¥ {data.income.toFixed(2)}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div className="text-sm text-[#6f7aa8]">今日模型调用</div>
            <div className="mt-1 text-3xl font-semibold text-[#27357a]">{data.modelCalls}</div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div className="text-sm text-[#6f7aa8]">今日活跃用户</div>
            <div className="mt-1 text-3xl font-semibold text-[#27357a]">{data.activeUsers}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div className="text-sm text-[#6f7aa8]">累计收入</div>
            <div className="mt-1 text-3xl font-semibold text-[#27357a]">¥ {data.totalIncome.toFixed(2)}</div>
          </Card>
        </Col>
        <Col xs={24} sm={24} lg={12}>
          <Card
            title="任务状态分布"
            extra={
              <Button onClick={() => void loadDashboard()} loading={loading}>
                刷新
              </Button>
            }
          >
            <Column data={statusData} xField="status" yField="value" height={220} label={false} />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="近 7 日任务趋势">
            <Area data={data.taskTrend} xField="day" yField="count" height={260} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="近 7 日预估成本（元）">
            <Area data={data.costTrend} xField="day" yField="cny" height={260} />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="模型调用排行">
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
          <Card title="最近任务">
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
