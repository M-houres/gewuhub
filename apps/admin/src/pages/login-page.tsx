import { Button, Card, Form, Input, Typography, message } from "antd";
import { useState } from "react";
import { saveAdminSession } from "../lib/admin-auth";
import { apiBase } from "../lib/api";
import { useAdminLocale } from "../lib/locale";

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
  return text || `request failed: ${response.status}`;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const { pick } = useAdminLocale();
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
      msgApi.success(pick("登录成功", "Login successful"));
      onSuccess();
    } catch {
      msgApi.error(pick("登录时发生网络错误", "Network error while logging in"));
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
          {pick("Gewu 管理后台登录", "Gewu Admin Login")}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
          {pick("登录后即可访问用户、订单与模型管理能力。", "Sign in to access user, order, and model management.")}
        </Typography.Paragraph>

        <Form<LoginFormValues> layout="vertical" onFinish={(values) => void onFinish(values)}>
          <Form.Item
            label={pick("用户名", "Username")}
            name="username"
            rules={[{ required: true, message: pick("请输入用户名", "Please enter username") }]}
          >
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item
            label={pick("密码", "Password")}
            name="password"
            rules={[{ required: true, message: pick("请输入密码", "Please enter password") }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {pick("登录", "Sign In")}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
