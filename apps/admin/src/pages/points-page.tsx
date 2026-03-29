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
  return date.toLocaleString("zh-CN");
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
      msgApi.error("加载积分记录失败");
    } finally {
      setLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    void loadPoints();
  }, [loadPoints]);

  const columns: ColumnsType<PointRecord> = [
    { title: "用户", dataIndex: "userId", key: "userId", width: 140 },
    { title: "原因", dataIndex: "reason", key: "reason" },
    {
      title: "变动",
      dataIndex: "change",
      key: "change",
      width: 110,
      render: (value: number) => (
        <span style={{ color: value > 0 ? "#15803d" : "#b91c1c" }}>{value > 0 ? `+${value}` : value}</span>
      ),
    },
    {
      title: "时间",
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
        title="积分变动记录"
        extra={
          <Button onClick={() => void loadPoints()} loading={loading}>
            刷新
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 850 }} />
      </Card>
      <Card title="规则快照">
        <p>每日签到奖励：5 积分/天。</p>
        <p>邀请奖励：80 积分/人（占位配置）。</p>
        <p>面向用户分组的批量赠送能力将在后续版本提供。</p>
      </Card>
    </Space>
  );
}


