import { Button, Card, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

type TaskRow = {
  id: string;
  userId: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed";
  pointsCost: number;
  createdAt: string;
  payload: {
    provider: string;
    modelId: string;
  };
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

export function TasksPage() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msgApi, contextHolder] = message.useMessage();

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<TaskRow[]>("/api/v1/admin/tasks");
      setRows(data);
    } catch {
      msgApi.error("任务加载失败");
    } finally {
      setLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const columns: ColumnsType<TaskRow> = [
    { title: "任务ID", dataIndex: "id", key: "id", width: 170 },
    { title: "用户", dataIndex: "userId", key: "userId", width: 130 },
    { title: "类型", dataIndex: "type", key: "type", width: 120 },
    {
      title: "模型",
      key: "model",
      width: 170,
      render: (_value, row) => `${row.payload.provider}/${row.payload.modelId}`,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: TaskRow["status"]) => {
        const colorMap: Record<TaskRow["status"], string> = {
          queued: "default",
          running: "blue",
          completed: "green",
          failed: "red",
        };
        return <Tag color={colorMap[status]}>{status === "queued" ? "排队中" : status === "running" ? "运行中" : status === "completed" ? "已完成" : "失败"}</Tag>;
      },
    },
    { title: "积分", dataIndex: "pointsCost", key: "pointsCost", width: 90 },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <Card
        title="任务监控"
        extra={
          <Button onClick={() => void loadTasks()} loading={loading}>
            刷新
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 950 }} />
      </Card>
    </Space>
  );
}


