import { Button, Layout, Typography } from "antd";
import { Link, Navigate, Outlet } from "react-router-dom";
import { clearSession, getToken, getUser } from "./session";

export function AppShell() {
  const token = getToken();
  const user = getUser();
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Header className="mast">
        <Link to="/inbox" className="brand">
          <Typography.Title level={3} style={{ margin: 0, color: "#e8b86d", fontFamily: "Instrument Serif, serif" }}>
            分诊台
          </Typography.Title>
          <span>TriageDesk · PostgreSQL</span>
        </Link>
        <div className="who">
          <Link to="/inbox">收件匣</Link>
          {user.role === "admin" ? <Link to="/knowledge">知识库</Link> : null}
          {user.role === "admin" ? <Link to="/audit">审计</Link> : null}
          <span>
            席位 <b>{user.username}</b> · {user.role}
          </span>
          <Button
            onClick={() => {
              clearSession();
              window.location.assign("/login");
            }}
          >
            下班
          </Button>
        </div>
      </Layout.Header>
      <Layout.Content className="stage">
        <Outlet />
      </Layout.Content>
    </Layout>
  );
}
