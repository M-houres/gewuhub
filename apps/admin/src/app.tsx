import {
  DashboardOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FireOutlined,
  FileTextOutlined,
  GiftOutlined,
  SettingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import ProLayout, { PageContainer } from "@ant-design/pro-layout";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { Button, ConfigProvider, Space, Spin, Typography, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { clearAdminSession, getValidAdminSession } from "./lib/admin-auth";
import { fetchJson, hasStaticAdminToken } from "./lib/api";
import { useAdminLocale } from "./lib/locale";
import { ContentPage } from "./pages/content-page";
import { DashboardPage } from "./pages/dashboard-page";
import { LoginPage } from "./pages/login-page";
import { ModelsPage } from "./pages/models-page";
import { OrdersPage } from "./pages/orders-page";
import { PaymentLogsPage } from "./pages/payment-logs-page";
import { PlansPage } from "./pages/plans-page";
import { PointsPage } from "./pages/points-page";
import { SettingsPage } from "./pages/settings-page";
import { TasksPage } from "./pages/tasks-page";
import { UsersPage } from "./pages/users-page";

type AdminMePayload = {
  username: string;
  expiresAt: string | null;
  authType: "legacy-token" | "session";
};

function App() {
  const { isChinese, pick, toggleLocale } = useAdminLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [adminIdentity, setAdminIdentity] = useState<AdminMePayload | null>(null);
  const [msgApi, contextHolder] = message.useMessage();

  const menuData = useMemo(
    () => [
      { path: "/", name: pick("仪表盘", "Dashboard"), icon: <DashboardOutlined /> },
      { path: "/users", name: pick("用户管理", "Users"), icon: <TeamOutlined /> },
      { path: "/tasks", name: pick("任务管理", "Tasks"), icon: <FireOutlined /> },
      { path: "/orders", name: pick("订单管理", "Orders"), icon: <DollarOutlined /> },
      { path: "/payment-logs", name: pick("支付回调", "Payment Logs"), icon: <DollarOutlined /> },
      { path: "/plans", name: pick("套餐管理", "Plans"), icon: <GiftOutlined /> },
      { path: "/models", name: pick("模型管理", "Models"), icon: <DatabaseOutlined /> },
      { path: "/content", name: pick("内容管理", "Content"), icon: <FileTextOutlined /> },
      { path: "/points", name: pick("积分管理", "Points"), icon: <GiftOutlined /> },
      { path: "/settings", name: pick("系统设置", "Settings"), icon: <SettingOutlined /> },
    ],
    [pick],
  );

  const pageMeta = useMemo<Record<string, { title: string; subtitle: string }>>(
    () => ({
      "/": {
        title: pick("管理后台总览", "Admin Dashboard"),
        subtitle: pick("查看今日用户、任务、收入、模型调用与任务健康情况。", "Monitor today's users, tasks, income, model usage, and task health."),
      },
      "/users": {
        title: pick("用户管理", "User Management"),
        subtitle: pick("查看用户、调整积分，并处理封禁与解封。", "View users, adjust points, and ban or unban abnormal accounts."),
      },
      "/tasks": {
        title: pick("任务管理", "Task Management"),
        subtitle: pick("跟踪全部 AI 任务并快速定位失败任务。", "Track all AI tasks and quickly locate failed jobs."),
      },
      "/orders": {
        title: pick("订单管理", "Order Management"),
        subtitle: pick("查看支付记录并处理幂等退款。", "Review payment records and process idempotent refunds."),
      },
      "/payment-logs": {
        title: pick("支付回调日志", "Payment Callback Logs"),
        subtitle: pick("检查签名校验与回调幂等处理结果。", "Inspect callback signature validation and idempotent processing results."),
      },
      "/plans": {
        title: pick("套餐管理", "Plan Management"),
        subtitle: pick("维护套餐价格、额度与功能说明。", "Maintain package price, quota, and plan details."),
      },
      "/models": {
        title: pick("模型管理", "Model Management"),
        subtitle: pick("控制模型启用状态、API Key 与积分倍率。", "Control model enablement, API key state, and point multipliers."),
      },
      "/content": {
        title: pick("内容管理", "Content Management"),
        subtitle: pick("维护教程文章与站点公告内容。", "Maintain tutorial articles and site announcements."),
      },
      "/points": {
        title: pick("积分管理", "Points Management"),
        subtitle: pick("查看积分变动与全局积分规则。", "Review point changes and global point rules."),
      },
      "/settings": {
        title: pick("系统设置", "System Settings"),
        subtitle: pick("配置网站信息、SMTP 与签到规则。", "Configure website, SMTP, and global check-in rules."),
      },
    }),
    [pick],
  );

  const verifyAdminAuth = useCallback(async () => {
    const session = getValidAdminSession();
    const staticTokenEnabled = hasStaticAdminToken();
    if (!session && !staticTokenEnabled) {
      setAuthenticated(false);
      setAdminIdentity(null);
      setAuthReady(true);
      return;
    }

    try {
      const me = await fetchJson<AdminMePayload>("/api/v1/admin/auth/me");
      setAuthenticated(true);
      setAdminIdentity(me);
    } catch {
      clearAdminSession();
      setAuthenticated(false);
      setAdminIdentity(null);
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    void verifyAdminAuth();
  }, [verifyAdminAuth]);

  const onLoginSuccess = useCallback(() => {
    setAuthReady(false);
    void verifyAdminAuth().then(() => {
      navigate("/", { replace: true });
    });
  }, [navigate, verifyAdminAuth]);

  const logout = useCallback(async () => {
    if (hasStaticAdminToken()) {
      msgApi.warning(
        pick(
          "当前启用了静态 Token 模式，如需使用会话退出，请移除 VITE_ADMIN_TOKEN。",
          "Static token mode is enabled; remove VITE_ADMIN_TOKEN to use session logout.",
        ),
      );
      return;
    }

    try {
      await fetchJson<{ success: boolean }>("/api/v1/admin/auth/logout", {
        method: "POST",
      });
    } catch {
      // Keep local logout behavior even if API call fails.
    }

    clearAdminSession();
    setAuthenticated(false);
    setAdminIdentity(null);
    navigate("/login", { replace: true });
  }, [msgApi, navigate, pick]);

  if (!authReady) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f7ff",
          color: "#445087",
        }}
      >
        <Space size={12}>
          <Spin size="small" />
          <span>{pick("正在检查管理员会话...", "Checking admin session...")}</span>
        </Space>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <>
        {contextHolder}
        <Routes>
          <Route path="/login" element={<LoginPage onSuccess={onLoginSuccess} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </>
    );
  }

  if (location.pathname === "/login") {
    return <Navigate to="/" replace />;
  }

  const current = pageMeta[location.pathname] ?? pageMeta["/"];

  return (
    <ConfigProvider
      locale={isChinese ? zhCN : enUS}
      theme={{
        token: {
          colorPrimary: "#4f46e5",
          borderRadius: 10,
        },
      }}
    >
      {contextHolder}
      <div style={{ minHeight: "100vh", background: "#f4f7ff" }}>
        <ProLayout
          title={pick("Gewu 管理后台", "Gewu Admin")}
          logo={false}
          layout="mix"
          navTheme="light"
          menu={{ defaultOpenAll: true }}
          actionsRender={() => [
            <Space key="admin-actions" size={12}>
              <Button onClick={() => toggleLocale()}>{isChinese ? "EN" : "中文"}</Button>
              <Typography.Text type="secondary">
                {pick("管理员", "Admin")}: {adminIdentity?.username || "admin"}
              </Typography.Text>
              <Button onClick={() => void logout()}>{pick("退出登录", "Logout")}</Button>
            </Space>,
          ]}
          route={{ path: "/", routes: menuData }}
          location={{ pathname: location.pathname }}
          menuItemRender={(item, dom) => (
            <a
              onClick={(event) => {
                event.preventDefault();
                if (item.path) navigate(item.path);
              }}
              href={item.path}
            >
              {dom}
            </a>
          )}
          fixedHeader
          fixSiderbar
        >
          <PageContainer title={current.title} content={current.subtitle} ghost={false} style={{ margin: 12 }}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/payment-logs" element={<PaymentLogsPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/content" element={<ContentPage />} />
              <Route path="/points" element={<PointsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PageContainer>
        </ProLayout>
      </div>
    </ConfigProvider>
  );
}

export default App;
