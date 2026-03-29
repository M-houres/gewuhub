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

function channelLabel(channel: OrderRow["channel"]) {
  if (channel === "alipay") return "支付宝";
  if (channel === "wechat") return "微信支付";
  if (channel === "stripe") return "Stripe";
  return "模拟通道";
}

function orderTypeLabel(orderType: OrderRow["orderType"]) {
  return orderType === "plan" ? "套餐购买" : "积分充值";
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
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
      msgApi.error(error instanceof Error ? error.message : "加载订单失败");
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
          reason: "管理员手动退款",
        }),
      });
      const amountText = `¥ ${data.refundedAmount}`;
      msgApi.success(
        data.partialRefund
          ? `${data.message}。已退款 ${data.refundedPoints} 积分 / ${amountText}`
          : `${data.message}。已退款 ${amountText}`,
      );
      await loadOrders();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "退款失败");
    } finally {
      setRefundingOrderId(null);
    }
  };

  const columns: ColumnsType<OrderRow> = [
    { title: "订单ID", dataIndex: "id", key: "id", width: 180, fixed: "left" },
    { title: "商户单号", dataIndex: "outTradeNo", key: "outTradeNo", width: 210 },
    { title: "用户", dataIndex: "userId", key: "userId", width: 140 },
    {
      title: "类型",
      dataIndex: "orderType",
      key: "orderType",
      width: 100,
      render: (value: OrderRow["orderType"]) => orderTypeLabel(value),
    },
    { title: "套餐/来源", dataIndex: "planName", key: "planName", width: 130, render: (value?: string) => value || "-" },
    { title: "金额", dataIndex: "amount", key: "amount", width: 110, render: (value: number) => `¥ ${value}` },
    { title: "积分", dataIndex: "pointsAmount", key: "pointsAmount", width: 90 },
    { title: "可退积分", dataIndex: "availablePoints", key: "availablePoints", width: 90, render: (value?: number) => value ?? "-" },
    { title: "已退积分", dataIndex: "refundedPoints", key: "refundedPoints", width: 90, render: (value?: number) => value ?? "-" },
    {
      title: "渠道",
      dataIndex: "channel",
      key: "channel",
      width: 120,
      render: (value: OrderRow["channel"]) => channelLabel(value),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (status: OrderRow["status"]) => (
        <Tag color={statusColor(status)}>{status === "pending" ? "待支付" : status === "paid" ? "已支付" : status === "failed" ? "失败" : "已退款"}</Tag>
      ),
    },
    { title: "部分退款", dataIndex: "partialRefund", key: "partialRefund", width: 90, render: (value?: boolean) => (value ? "是" : "-") },
    { title: "回调次数", dataIndex: "callbackCount", key: "callbackCount", width: 90 },
    { title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 170, render: (value: string) => formatDateTime(value) },
    { title: "支付时间", dataIndex: "paidAt", key: "paidAt", width: 170, render: (value?: string) => formatDateTime(value) },
    { title: "退款时间", dataIndex: "refundedAt", key: "refundedAt", width: 170, render: (value?: string) => formatDateTime(value) },
    {
      title: "操作",
      key: "action",
      width: 150,
      fixed: "right",
      render: (_, row) => {
        const canRefund = row.orderType === "topup" && row.status === "paid";
        if (!canRefund) return <span>-</span>;
        return (
          <Popconfirm
            title="确认退款该订单？"
            description="系统仅退还未消耗积分，并执行幂等处理。"
            onConfirm={() => void refundOrder(row.id)}
            okButtonProps={{ loading: refundingOrderId === row.id }}
          >
            <Button size="small" danger loading={refundingOrderId === row.id}>
              退款
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
        title="支付订单"
        extra={
          <Button onClick={() => void loadOrders()} loading={loading}>
            刷新
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 2200 }} />
      </Card>
    </Space>
  );
}


