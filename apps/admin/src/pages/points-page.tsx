import { Button, Card, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

type PointRecord = {
  id: string;
  userId: string;
  reason: string;
  change: number;
  createdAt: string;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString();
}

export function PointsPage() {
  const [rows, setRows] = useState<PointRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [msgApi, contextHolder] = message.useMessage();

  const loadPoints = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<PointRecord[]>("/api/v1/admin/points");
      setRows(data);
    } catch {
      msgApi.error("Failed to load point records");
    } finally {
      setLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    void loadPoints();
  }, [loadPoints]);

  const columns: ColumnsType<PointRecord> = [
    { title: "User", dataIndex: "userId", key: "userId", width: 140 },
    { title: "Reason", dataIndex: "reason", key: "reason" },
    {
      title: "Change",
      dataIndex: "change",
      key: "change",
      width: 110,
      render: (value: number) => (
        <span style={{ color: value > 0 ? "#15803d" : "#b91c1c" }}>{value > 0 ? `+${value}` : value}</span>
      ),
    },
    {
      title: "Time",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <Card
        title="Point Change Records"
        extra={
          <Button onClick={() => void loadPoints()} loading={loading}>
            Refresh
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 850 }} />
      </Card>
      <Card title="Rules Snapshot">
        <p>Daily check-in reward: 5 points/day.</p>
        <p>Invite reward: 80 points/invite (placeholder).</p>
        <p>Bulk grants to user groups can be managed in a later phase.</p>
      </Card>
    </Space>
  );
}
