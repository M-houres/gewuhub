import { Button, Card, Popconfirm, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

type OrderRow = {
  id: string;
  userId: string;
  orderType: "plan" | "topup";
  planName?: string;
  pointsAmount: number;
  creditedPoints?: number;
  availablePoints?: number;
  amount: number;
  currency: "CNY";
  channel: "alipay" | "wechat" | "stripe" | "mock";
  outTradeNo: string;
  transactionId?: string;
  status: "pending" | "paid" | "failed" | "refunded";
  callbackCount: number;
  createdAt: string;
  paidAt?: string;
  refundedAt?: string;
  refundedPoints?: number;
  refundedAmount?: number;
  partialRefund?: boolean;
  refundReason?: string;
};

type RefundResponse = {
  message: string;
  idempotent: boolean;
  orderId: string;
  refundedPoints: number;
  refundedAmount: number;
  partialRefund: boolean;
  status: "refunded";
};

function statusColor(status: OrderRow["status"]) {
  if (status === "paid") return "green";
  if (status === "pending") return "blue";
  if (status === "failed") return "red";
  return "orange";
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString();
}

export function OrdersPage() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refundingOrderId, setRefundingOrderId] = useState<string | null>(null);
  const [msgApi, contextHolder] = message.useMessage();

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<OrderRow[]>("/api/v1/admin/orders");
      setRows(data);
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const refundOrder = async (orderId: string) => {
    try {
      setRefundingOrderId(orderId);
      const data = await fetchJson<RefundResponse>(`/api/v1/admin/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "admin manual refund",
        }),
      });
      const amountText = `CNY ${data.refundedAmount}`;
      msgApi.success(
        data.partialRefund
          ? `${data.message}. Refunded ${data.refundedPoints} points / ${amountText}`
          : `${data.message}. Refunded ${amountText}`,
      );
      await loadOrders();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "Refund failed");
    } finally {
      setRefundingOrderId(null);
    }
  };

  const columns: ColumnsType<OrderRow> = [
    { title: "Order ID", dataIndex: "id", key: "id", width: 180, fixed: "left" },
    { title: "OutTradeNo", dataIndex: "outTradeNo", key: "outTradeNo", width: 210 },
    { title: "User", dataIndex: "userId", key: "userId", width: 140 },
    { title: "Type", dataIndex: "orderType", key: "orderType", width: 90 },
    { title: "Plan/Source", dataIndex: "planName", key: "planName", width: 130, render: (value?: string) => value || "-" },
    { title: "Amount", dataIndex: "amount", key: "amount", width: 110, render: (value: number) => `CNY ${value}` },
    { title: "Points", dataIndex: "pointsAmount", key: "pointsAmount", width: 90 },
    { title: "Available", dataIndex: "availablePoints", key: "availablePoints", width: 90, render: (value?: number) => value ?? "-" },
    { title: "Refunded", dataIndex: "refundedPoints", key: "refundedPoints", width: 90, render: (value?: number) => value ?? "-" },
    { title: "Channel", dataIndex: "channel", key: "channel", width: 90 },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (status: OrderRow["status"]) => <Tag color={statusColor(status)}>{status}</Tag>,
    },
    { title: "Partial", dataIndex: "partialRefund", key: "partialRefund", width: 90, render: (value?: boolean) => (value ? "Yes" : "-") },
    { title: "Callback", dataIndex: "callbackCount", key: "callbackCount", width: 90 },
    { title: "Created", dataIndex: "createdAt", key: "createdAt", width: 170, render: (value: string) => formatDateTime(value) },
    { title: "Paid", dataIndex: "paidAt", key: "paidAt", width: 170, render: (value?: string) => formatDateTime(value) },
    { title: "Refunded At", dataIndex: "refundedAt", key: "refundedAt", width: 170, render: (value?: string) => formatDateTime(value) },
    {
      title: "Action",
      key: "action",
      width: 150,
      fixed: "right",
      render: (_, row) => {
        const canRefund = row.orderType === "topup" && row.status === "paid";
        if (!canRefund) return <span>-</span>;
        return (
          <Popconfirm
            title="Refund this order?"
            description="The system refunds only unconsumed points and will process idempotently."
            onConfirm={() => void refundOrder(row.id)}
            okButtonProps={{ loading: refundingOrderId === row.id }}
          >
            <Button size="small" danger loading={refundingOrderId === row.id}>
              Refund
            </Button>
          </Popconfirm>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <Card
        title="Payment Orders"
        extra={
          <Button onClick={() => void loadOrders()} loading={loading}>
            Refresh
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 2200 }} />
      </Card>
    </Space>
  );
}
