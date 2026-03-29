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
  return date.toLocaleString("zh-CN");
}

function channelLabel(channel: PaymentCallbackLogRow["channel"]) {
  if (channel === "alipay") return "支付宝";
  if (channel === "wechat") return "微信支付";
  if (channel === "stripe") return "Stripe";
  return "模拟通道";
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
      msgApi.error(error instanceof Error ? error.message : "加载支付回调日志失败");
    } finally {
      setLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const columns: ColumnsType<PaymentCallbackLogRow> = [
    { title: "时间", dataIndex: "createdAt", key: "createdAt", width: 170, render: (value: string) => formatDateTime(value) },
    { title: "商户单号", dataIndex: "outTradeNo", key: "outTradeNo", width: 220 },
    { title: "订单ID", dataIndex: "orderId", key: "orderId", width: 140, render: (value?: string) => value || "-" },
    {
      title: "渠道",
      dataIndex: "channel",
      key: "channel",
      width: 100,
      render: (value: PaymentCallbackLogRow["channel"]) => channelLabel(value),
    },
    { title: "交易号", dataIndex: "transactionId", key: "transactionId", width: 200, render: (value?: string) => value || "-" },
    {
      title: "验签",
      dataIndex: "verified",
      key: "verified",
      width: 90,
      render: (value: boolean) => <Tag color={value ? "green" : "red"}>{value ? "通过" : "失败"}</Tag>,
    },
    {
      title: "受理",
      dataIndex: "accepted",
      key: "accepted",
      width: 90,
      render: (value: boolean) => <Tag color={value ? "green" : "orange"}>{value ? "通过" : "失败"}</Tag>,
    },
    { title: "原因", dataIndex: "reason", key: "reason", width: 180 },
    { title: "回调负载", dataIndex: "payload", key: "payload", render: (value: string) => <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{value}</pre> },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <Card
        title="支付回调日志"
        extra={
          <Button onClick={() => void loadLogs()} loading={loading}>
            刷新
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 1600 }} />
      </Card>
    </Space>
  );
}

