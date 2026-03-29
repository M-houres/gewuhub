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
import zhCN from "antd/locale/zh_CN";
import { Button, ConfigProvider, Space, Spin, Typography, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { clearAdminSession, getValidAdminSession } from "./lib/admin-auth";
import { fetchJson, hasStaticAdminToken } from "./lib/api";
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
  const location = useLocation();
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [adminIdentity, setAdminIdentity] = useState<AdminMePayload | null>(null);
  const [msgApi, contextHolder] = message.useMessage();

  const menuData = useMemo(
    () => [
      { path: "/", name: "仪表盘", icon: <DashboardOutlined /> },
      { path: "/users", name: "用户管理", icon: <TeamOutlined /> },
      { path: "/tasks", name: "任务管理", icon: <FireOutlined /> },
      { path: "/orders", name: "订单管理", icon: <DollarOutlined /> },
      { path: "/payment-logs", name: "支付回调", icon: <DollarOutlined /> },
      { path: "/plans", name: "套餐管理", icon: <GiftOutlined /> },
      { path: "/models", name: "模型管理", icon: <DatabaseOutlined /> },
      { path: "/content", name: "内容管理", icon: <FileTextOutlined /> },
      { path: "/points", name: "积分管理", icon: <GiftOutlined /> },
      { path: "/settings", name: "系统设置", icon: <SettingOutlined /> },
    ],
    [],
  );

  const pageMeta = useMemo<Record<string, { title: string; subtitle: string }>>(
    () => ({
      "/": {
        title: "管理后台总览",
        subtitle: "查看今日用户、任务、收入、模型调用与任务健康情况。",
      },
      "/users": {
        title: "用户管理",
        subtitle: "查看用户、调整积分，并处理封禁与解封。",
      },
      "/tasks": {
        title: "任务管理",
        subtitle: "跟踪全部 AI 任务并快速定位失败任务。",
      },
      "/orders": {
        title: "订单管理",
        subtitle: "查看支付记录并处理幂等退款。",
      },
      "/payment-logs": {
        title: "支付回调日志",
        subtitle: "检查签名校验与回调幂等处理结果。",
      },
      "/plans": {
        title: "套餐管理",
        subtitle: "维护套餐价格、额度与功能说明。",
      },
      "/models": {
        title: "模型管理",
        subtitle: "控制模型启用状态、API 密钥与积分倍率。",
      },
      "/content": {
        title: "内容管理",
        subtitle: "维护教程文章与站点公告内容。",
      },
      "/points": {
        title: "积分管理",
        subtitle: "查看积分变动与全局积分规则。",
      },
      "/settings": {
        title: "系统设置",
        subtitle: "配置网站信息、SMTP 与签到规则。",
      },
    }),
    [],
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
      msgApi.warning("当前启用了静态 Token 模式，如需使用会话退出，请移除 VITE_ADMIN_TOKEN。");
      return;
    }

    try {
      await fetchJson<{ success: boolean }>("/api/v1/admin/auth/logout", {
        method: "POST",
      });
    } catch {
      // API 失败时仍执行本地退出。
    }

    clearAdminSession();
    setAuthenticated(false);
    setAdminIdentity(null);
    navigate("/login", { replace: true });
  }, [msgApi, navigate]);

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
          <span>正在检查管理员会话...</span>
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
      locale={zhCN}
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
          title="Gewu 管理后台"
          logo={false}
          layout="mix"
          navTheme="light"
          menu={{ defaultOpenAll: true }}
          actionsRender={() => [
            <Space key="admin-actions" size={12}>
              <Typography.Text type="secondary">管理员：{adminIdentity?.username || "管理员"}</Typography.Text>
              <Button onClick={() => void logout()}>退出登录</Button>
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






