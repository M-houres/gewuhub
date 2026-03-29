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
    return date.toLocaleString("zh-CN");
  };

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<UserRow[]>("/api/v1/admin/users");
      setRows(data);
    } catch {
      msgApi.error("加载用户失败");
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
        msgApi.success(`积分已更新，当前积分：${result.points}`);
        form.resetFields();
        void loadUsers();
      } catch {
        msgApi.error("调整积分失败");
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
          reason: nextBanned ? "管理员手动封禁" : "管理员手动解封",
        }),
      });
      msgApi.success(result.banned ? "用户已封禁" : "用户已解封");
      void loadUsers();
    } catch (error) {
      msgApi.error(error instanceof Error ? error.message : "更新用户状态失败");
    } finally {
      setUpdatingBanUserId(null);
    }
  };

  const columns: ColumnsType<UserRow> = [
    { title: "用户ID", dataIndex: "id", key: "id" },
    { title: "邮箱", dataIndex: "email", key: "email" },
    {
      title: "邮箱验证",
      dataIndex: "emailVerified",
      key: "emailVerified",
      render: (verified: boolean) => <Tag color={verified ? "green" : "orange"}>{verified ? "已验证" : "未验证"}</Tag>,
    },
    {
      title: "角色",
      dataIndex: "role",
      key: "role",
      render: (role: UserRow["role"]) => <Tag color={role === "ADMIN" ? "purple" : "blue"}>{role === "ADMIN" ? "管理员" : "用户"}</Tag>,
    },
    {
      title: "状态",
      dataIndex: "banned",
      key: "banned",
      render: (banned: boolean) => <Tag color={banned ? "red" : "green"}>{banned ? "已封禁" : "正常"}</Tag>,
    },
    {
      title: "封禁原因",
      dataIndex: "banReason",
      key: "banReason",
      render: (value?: string) => value || "-",
    },
    {
      title: "封禁时间",
      dataIndex: "bannedAt",
      key: "bannedAt",
      render: (value?: string) => formatDateTime(value),
    },
    { title: "通用积分", dataIndex: "points", key: "points" },
    { title: "智能体积分", dataIndex: "agentPoints", key: "agentPoints" },
    { title: "创建时间", dataIndex: "createdAt", key: "createdAt", render: (value: string) => formatDateTime(value) },
    {
      title: "操作",
      key: "action",
      render: (_, row) => {
        if (row.role === "ADMIN") {
          return <span>-</span>;
        }
        const nextBanned = !row.banned;
        return (
          <Popconfirm
            title={nextBanned ? "确认封禁该用户？" : "确认解封该用户？"}
            onConfirm={() => void onToggleBan(row, nextBanned)}
            okButtonProps={{ loading: updatingBanUserId === row.id }}
          >
            <Button danger={nextBanned} loading={updatingBanUserId === row.id}>
              {nextBanned ? "封禁" : "解封"}
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
        title="用户管理"
        extra={
          <Button onClick={() => void loadUsers()} loading={loading}>
            刷新
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 1500 }} />
      </Card>

      <Card title="积分调整">
        <Form form={form} layout="inline">
          <Form.Item name="userId" rules={[{ required: true, message: "请输入用户ID" }]}>
            <Input placeholder="用户ID" />
          </Form.Item>
          <Form.Item name="change" rules={[{ required: true, message: "请输入积分变动值" }]}>
            <Input placeholder="变动值（如 +100 / -50）" />
          </Form.Item>
          <Form.Item name="reason" rules={[{ required: true, message: "请输入原因" }]}>
            <Input placeholder="原因" />
          </Form.Item>
          <Button type="primary" onClick={onAdjustPoints}>
            提交
          </Button>
        </Form>
      </Card>
    </Space>
  );
}




