import { Button, Card, Form, Input, Popconfirm, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

type UserRow = {
  id: string;
  email: string;
  emailVerified: boolean;
  banned: boolean;
  bannedAt?: string;
  banReason?: string;
  role: "USER" | "ADMIN";
  points: number;
  agentPoints: number;
  createdAt: string;
};

type UserAdjustResponse = {
  userId: string;
  points: number;
  agentPoints: number;
};

type UserBanResponse = {
  userId: string;
  banned: boolean;
  bannedAt?: string;
  banReason?: string;
};

export function UsersPage() {
  const [form] = Form.useForm();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingBanUserId, setUpdatingBanUserId] = useState<string | null>(null);
  const [msgApi, contextHolder] = message.useMessage();

  const formatDateTime = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    return date.toLocaleString();
  };

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<UserRow[]>("/api/v1/admin/users");
      setRows(data);
    } catch {
      msgApi.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const onAdjustPoints = () => {
    form.validateFields().then(async (values) => {
      try {
        const result = await fetchJson<UserAdjustResponse>(`/api/v1/admin/users/${values.userId}/points`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ change: Number(values.change), reason: values.reason }),
        });
        msgApi.success(`Points updated, current points: ${result.points}`);
        form.resetFields();
        void loadUsers();
      } catch {
        msgApi.error("Failed to adjust points");
      }
    });
  };

  const onToggleBan = async (user: UserRow, nextBanned: boolean) => {
    try {
      setUpdatingBanUserId(user.id);
      const result = await fetchJson<UserBanResponse>(`/api/v1/admin/users/${user.id}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          banned: nextBanned,
          reason: nextBanned ? "admin manual ban" : "admin manual unban",
        }),
      });
      msgApi.success(result.banned ? "User banned" : "User unbanned");
      void loadUsers();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "Failed to update user status");
    } finally {
      setUpdatingBanUserId(null);
    }
  };

  const columns: ColumnsType<UserRow> = [
    { title: "User ID", dataIndex: "id", key: "id" },
    { title: "Email", dataIndex: "email", key: "email" },
    {
      title: "Email Verified",
      dataIndex: "emailVerified",
      key: "emailVerified",
      render: (verified: boolean) => <Tag color={verified ? "green" : "orange"}>{verified ? "Verified" : "Unverified"}</Tag>,
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      render: (role: UserRow["role"]) => <Tag color={role === "ADMIN" ? "purple" : "blue"}>{role}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "banned",
      key: "banned",
      render: (banned: boolean) => <Tag color={banned ? "red" : "green"}>{banned ? "Banned" : "Active"}</Tag>,
    },
    {
      title: "Ban Reason",
      dataIndex: "banReason",
      key: "banReason",
      render: (value?: string) => value || "-",
    },
    {
      title: "Banned At",
      dataIndex: "bannedAt",
      key: "bannedAt",
      render: (value?: string) => formatDateTime(value),
    },
    { title: "Points", dataIndex: "points", key: "points" },
    { title: "Agent Points", dataIndex: "agentPoints", key: "agentPoints" },
    { title: "Created At", dataIndex: "createdAt", key: "createdAt", render: (value: string) => formatDateTime(value) },
    {
      title: "Action",
      key: "action",
      render: (_, row) => {
        if (row.role === "ADMIN") {
          return <span>-</span>;
        }
        const nextBanned = !row.banned;
        return (
          <Popconfirm
            title={nextBanned ? "Ban this user?" : "Unban this user?"}
            onConfirm={() => void onToggleBan(row, nextBanned)}
            okButtonProps={{ loading: updatingBanUserId === row.id }}
          >
            <Button danger={nextBanned} loading={updatingBanUserId === row.id}>
              {nextBanned ? "Ban" : "Unban"}
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
        title="Users"
        extra={
          <Button onClick={() => void loadUsers()} loading={loading}>
            Refresh
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 1500 }} />
      </Card>

      <Card title="Adjust Points">
        <Form form={form} layout="inline">
          <Form.Item name="userId" rules={[{ required: true, message: "Please input user ID" }]}>
            <Input placeholder="User ID" />
          </Form.Item>
          <Form.Item name="change" rules={[{ required: true, message: "Please input points delta" }]}>
            <Input placeholder="Delta (e.g. +100 / -50)" />
          </Form.Item>
          <Form.Item name="reason" rules={[{ required: true, message: "Please input reason" }]}>
            <Input placeholder="Reason" />
          </Form.Item>
          <Button type="primary" onClick={onAdjustPoints}>
            Submit
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
