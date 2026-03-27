"use client";

import { getValidSession, toApiUrl } from "@/lib/auth";
import { useEffect, useMemo, useState } from "react";

type PointRecord = {
  id: string;
  userId: string;
  change: number;
  reason: string;
  createdAt: string;
};

type SummaryResponse = {
  userId: string;
  points: number;
  agentPoints: number;
  dailyDetectUsed: number;
  dailyDetectLimit: number;
};

type PaymentOrder = {
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
  paidAt?: string;
  refundedAt?: string;
  refundedPoints?: number;
  refundedAmount?: number;
  partialRefund?: boolean;
  refundReason?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
};

const rechargePackages = [
  { pointsAmount: 500, amount: 19 },
  { pointsAmount: 2000, amount: 69 },
  { pointsAmount: 5000, amount: 159 },
];

function formatDateTime(input: string) {
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) return input;
  return date.toLocaleString();
}

function statusLabel(status: PaymentOrder["status"]) {
  if (status === "pending") return "Pending";
  if (status === "paid") return "Paid";
  if (status === "failed") return "Failed";
  return "Refunded";
}

function statusClass(status: PaymentOrder["status"]) {
  if (status === "paid") return "text-[#218a53]";
  if (status === "pending") return "text-[#4f59a1]";
  if (status === "refunded") return "text-[#a55a00]";
  return "text-[#bf3f3f]";
}

export default function PointsPage() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [records, setRecords] = useState<PointRecord[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const todaySpent = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return records
      .filter((record) => record.createdAt.slice(0, 10) === today && record.change < 0)
      .reduce((sum, record) => sum + Math.abs(record.change), 0);
  }, [records]);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage("");
    const session = getValidSession();
    if (!session) {
      setErrorMessage("Session expired. Please login again.");
      setLoading(false);
      return;
    }

    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      };

      const [summaryResponse, recordsResponse, ordersResponse] = await Promise.all([
        fetch(toApiUrl("/api/v1/points/summary"), {
          method: "GET",
          headers,
        }),
        fetch(toApiUrl("/api/v1/points/records"), {
          method: "GET",
          headers,
        }),
        fetch(toApiUrl("/api/v1/payments/orders"), {
          method: "GET",
          headers,
        }),
      ]);

      if (!summaryResponse.ok || !recordsResponse.ok || !ordersResponse.ok) {
        setErrorMessage("Failed to load points data.");
        setLoading(false);
        return;
      }

      const summaryData = (await summaryResponse.json()) as SummaryResponse;
      const recordsData = (await recordsResponse.json()) as PointRecord[];
      const ordersData = (await ordersResponse.json()) as PaymentOrder[];
      setSummary(summaryData);
      setRecords(recordsData);
      setOrders(ordersData);
    } catch {
      setErrorMessage("Network error while loading points data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const checkin = async () => {
    const session = getValidSession();
    if (!session) {
      setErrorMessage("Session expired. Please login again.");
      return;
    }

    setCheckinLoading(true);
    setActionMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(toApiUrl("/api/v1/points/checkin"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
      });

      if (response.status === 409) {
        setActionMessage("Already checked in today.");
        return;
      }

      if (!response.ok) {
        setErrorMessage("Check-in failed.");
        return;
      }

      const data = (await response.json()) as { points: number; reward: number };
      setActionMessage(`Check-in success. +${data.reward} points.`);
      await loadData();
    } catch {
      setErrorMessage("Network error during check-in.");
    } finally {
      setCheckinLoading(false);
    }
  };

  const createRechargeOrder = async (pointsAmount: number, amount: number) => {
    const session = getValidSession();
    if (!session) {
      setErrorMessage("Session expired. Please login again.");
      return;
    }

    setCreatingOrder(true);
    setActionMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(toApiUrl("/api/v1/payments/orders"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          pointsAmount,
          amount,
          channel: "alipay",
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        setErrorMessage(data?.message || "Failed to create recharge order.");
        return;
      }

      const data = (await response.json()) as { outTradeNo: string };
      setActionMessage(`Order created: ${data.outTradeNo}. Click "Mock Pay" in the list to complete payment.`);
      await loadData();
    } catch {
      setErrorMessage("Network error while creating recharge order.");
    } finally {
      setCreatingOrder(false);
    }
  };

  const mockPay = async (orderId: string) => {
    const session = getValidSession();
    if (!session) {
      setErrorMessage("Session expired. Please login again.");
      return;
    }

    setPayingOrderId(orderId);
    setActionMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(toApiUrl(`/api/v1/payments/orders/${orderId}/mock-pay`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          status: "SUCCESS",
        }),
      });

      const data = (await response.json().catch(() => null)) as { message?: string; idempotent?: boolean } | null;
      if (!response.ok) {
        setErrorMessage(data?.message || "Mock payment failed.");
        return;
      }

      setActionMessage(data?.idempotent ? "Payment callback accepted (idempotent)." : "Payment success. Points received.");
      await loadData();
    } catch {
      setErrorMessage("Network error during mock payment.");
    } finally {
      setPayingOrderId(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="dashboard-card p-5">
        <h1 className="text-2xl font-semibold text-[#242d4d]">Points Center</h1>
        <p className="mt-1 text-sm text-[#69739b]">Check-in, points records, recharge orders and payment status.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: "General points", value: summary?.points ?? "--" },
          { label: "Agent points", value: summary?.agentPoints ?? "--" },
          { label: "Spent today", value: todaySpent },
          {
            label: "Daily detect remaining",
            value: summary ? `${Math.max(0, summary.dailyDetectLimit - summary.dailyDetectUsed)} times` : "--",
          },
        ].map((item) => (
          <article key={item.label} className="dashboard-card p-4">
            <p className="text-xs text-[#7480ac]">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold text-[#2f3b8f]">{item.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <article className="dashboard-card p-5">
          <h2 className="text-lg font-semibold text-[#2a3151]">Check-in & Invite</h2>
          <div className="mt-3 space-y-3">
            <button
              onClick={checkin}
              disabled={checkinLoading}
              className="w-full rounded-xl bg-gradient-to-r from-[#6366f1] to-[#7b4bf4] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {checkinLoading ? "Checking in..." : "Daily check-in (+5 points)"}
            </button>
            <div className="rounded-lg border border-[#dce2ff] bg-white p-3 text-sm text-[#5d678f]">
              Invite code:
              <span className="ml-1 font-semibold text-[#3d46b4]">GEWU2026</span>
            </div>
          </div>
        </article>

        <article className="dashboard-card p-5">
          <h2 className="text-lg font-semibold text-[#2a3151]">Recharge (Mock)</h2>
          <div className="mt-3 grid gap-2">
            {rechargePackages.map((item) => (
              <button
                key={`${item.pointsAmount}-${item.amount}`}
                onClick={() => createRechargeOrder(item.pointsAmount, item.amount)}
                disabled={creatingOrder}
                className="rounded-lg border border-[#d8defe] bg-white px-3 py-2 text-left text-sm text-[#4f59a1] transition hover:bg-[#f7f8ff] disabled:opacity-60"
              >
                {item.pointsAmount} points / CNY {item.amount}
              </button>
            ))}
            <p className="text-xs text-[#8a93b8]">
              Current phase uses mock payment only. Payment callback still runs server-side signature verification and idempotency checks.
            </p>
          </div>
        </article>
      </section>

      {errorMessage ? <p className="text-sm text-[#bf3f3f]">{errorMessage}</p> : null}
      {actionMessage ? <p className="text-sm text-[#2f8f5a]">{actionMessage}</p> : null}

      <section className="dashboard-card p-5">
        <h2 className="text-lg font-semibold text-[#2a3151]">Recharge Records</h2>
        {loading ? (
          <p className="mt-3 text-sm text-[#6d789f]">Loading...</p>
        ) : (
          <div className="mt-3 overflow-auto rounded-xl border border-[#e1e6ff]">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-[#f7f8ff] text-left text-[#6671a1]">
                <tr>
                  <th className="px-3 py-2 font-medium">OutTradeNo</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Points</th>
                  <th className="px-3 py-2 font-medium">Paid</th>
                  <th className="px-3 py-2 font-medium">Refund</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-t border-[#eef2ff] text-[#39416d]">
                    <td className="px-3 py-2">{order.outTradeNo}</td>
                    <td className="px-3 py-2">CNY {order.amount}</td>
                    <td className="px-3 py-2">{order.pointsAmount}</td>
                    <td className="px-3 py-2">{order.paidAt ? formatDateTime(order.paidAt) : "-"}</td>
                    <td className="px-3 py-2">
                      {order.status === "refunded" ? (
                        <span>
                          CNY {order.refundedAmount ?? 0} / {order.refundedPoints ?? 0} pts
                          {order.partialRefund ? " (partial)" : ""}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className={`px-3 py-2 font-medium ${statusClass(order.status)}`}>{statusLabel(order.status)}</td>
                    <td className="px-3 py-2">{formatDateTime(order.createdAt)}</td>
                    <td className="px-3 py-2">
                      {order.status === "pending" || order.status === "failed" ? (
                        <button
                          onClick={() => mockPay(order.id)}
                          disabled={payingOrderId === order.id}
                          className="rounded border border-[#d8defe] px-2 py-1 text-xs text-[#4f59a1] disabled:opacity-60"
                        >
                          {payingOrderId === order.id ? "Paying..." : "Mock Pay"}
                        </button>
                      ) : (
                        <span className="text-xs text-[#7c86af]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 ? (
                  <tr className="border-t border-[#eef2ff] text-[#6f789f]">
                    <td className="px-3 py-6 text-center" colSpan={8}>
                      No recharge records yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-card p-5">
        <h2 className="text-lg font-semibold text-[#2a3151]">Points Records</h2>
        {loading ? (
          <p className="mt-3 text-sm text-[#6d789f]">Loading...</p>
        ) : (
          <div className="mt-3 overflow-auto rounded-xl border border-[#e1e6ff]">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="bg-[#f7f8ff] text-left text-[#6671a1]">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-t border-[#eef2ff] text-[#39416d]">
                    <td className="px-3 py-2">{formatDateTime(record.createdAt)}</td>
                    <td className="px-3 py-2">{record.reason}</td>
                    <td className={`px-3 py-2 ${record.change >= 0 ? "text-[#218a53]" : "text-[#bf3f3f]"}`}>
                      {record.change >= 0 ? `+${record.change}` : record.change}
                    </td>
                  </tr>
                ))}
                {records.length === 0 ? (
                  <tr className="border-t border-[#eef2ff] text-[#6f789f]">
                    <td className="px-3 py-6 text-center" colSpan={3}>
                      No records yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
