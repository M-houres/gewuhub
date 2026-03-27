import { Button, Card, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

type PaymentCallbackLogRow = {
  id: string;
  outTradeNo: string;
  orderId?: string;
  channel: "alipay" | "wechat" | "stripe" | "mock";
  transactionId?: string;
  payload: string;
  verified: boolean;
  accepted: boolean;
  reason: string;
  createdAt: string;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString();
}

export function PaymentLogsPage() {
  const [rows, setRows] = useState<PaymentCallbackLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msgApi, contextHolder] = message.useMessage();

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<PaymentCallbackLogRow[]>("/api/v1/admin/payment-callback-logs");
      setRows(data);
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "Failed to load payment callback logs");
    } finally {
      setLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const columns: ColumnsType<PaymentCallbackLogRow> = [
    { title: "Time", dataIndex: "createdAt", key: "createdAt", width: 170, render: (value: string) => formatDateTime(value) },
    { title: "OutTradeNo", dataIndex: "outTradeNo", key: "outTradeNo", width: 220 },
    { title: "Order", dataIndex: "orderId", key: "orderId", width: 140, render: (value?: string) => value || "-" },
    { title: "Channel", dataIndex: "channel", key: "channel", width: 90 },
    { title: "Txn", dataIndex: "transactionId", key: "transactionId", width: 200, render: (value?: string) => value || "-" },
    {
      title: "Verified",
      dataIndex: "verified",
      key: "verified",
      width: 90,
      render: (value: boolean) => <Tag color={value ? "green" : "red"}>{value ? "yes" : "no"}</Tag>,
    },
    {
      title: "Accepted",
      dataIndex: "accepted",
      key: "accepted",
      width: 90,
      render: (value: boolean) => <Tag color={value ? "green" : "orange"}>{value ? "yes" : "no"}</Tag>,
    },
    { title: "Reason", dataIndex: "reason", key: "reason", width: 180 },
    { title: "Payload", dataIndex: "payload", key: "payload", render: (value: string) => <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{value}</pre> },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <Card
        title="Payment Callback Logs"
        extra={
          <Button onClick={() => void loadLogs()} loading={loading}>
            Refresh
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 1600 }} />
      </Card>
    </Space>
  );
}
