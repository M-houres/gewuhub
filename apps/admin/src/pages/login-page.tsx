import { Button, Card, Form, Input, Typography, message } from "antd";
import { useState } from "react";
import { saveAdminSession } from "../lib/admin-auth";
import { apiBase } from "../lib/api";

type LoginPageProps = {
  onSuccess: () => void;
};

type LoginFormValues = {
  username: string;
  password: string;
};

type AdminLoginResponse = {
  token: string;
  expiresAt: string;
  username: string;
};

async function parseErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    if (data?.message) return data.message;
  }
  const text = await response.text().catch(() => "");
  return text || `请求失败：${response.status}`;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [loading, setLoading] = useState(false);
  const [msgApi, contextHolder] = message.useMessage();

  const onFinish = async (values: LoginFormValues) => {
    try {
      setLoading(true);
      const response = await fetch(`${apiBase}/api/v1/admin/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        msgApi.error(await parseErrorMessage(response));
        return;
      }

      const data = (await response.json()) as AdminLoginResponse;
      saveAdminSession({
        accessToken: data.token,
        expiresAt: data.expiresAt,
        username: data.username,
      });
      msgApi.success("登录成功");
      onSuccess();
    } catch {
      msgApi.error("登录时发生网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "#f4f7ff",
        padding: "0 16px",
      }}
    >
      {contextHolder}
      <Card style={{ width: 420, borderRadius: 14 }}>
        <Typography.Title level={4} style={{ marginBottom: 8 }}>
          Gewu 管理后台登录
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
          登录后可访问用户、订单、模型和系统配置管理能力。
        </Typography.Paragraph>

        <Form<LoginFormValues> layout="vertical" onFinish={(values) => void onFinish(values)}>
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: "请输入用户名" }]}
          >
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
