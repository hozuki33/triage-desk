import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./App";
import { getToken } from "./session";
import "./styles.css";

const InboxPage = lazy(() => import("./pages/InboxPage").then((module) => ({ default: module.InboxPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const NewTicketPage = lazy(() => import("./pages/NewTicketPage").then((module) => ({ default: module.NewTicketPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((module) => ({ default: module.RegisterPage })));
const KnowledgePage = lazy(() => import("./pages/KnowledgePage").then((module) => ({ default: module.KnowledgePage })));
const AuditPage = lazy(() => import("./pages/AuditPage").then((module) => ({ default: module.AuditPage })));
const TicketPage = lazy(() => import("./pages/TicketPage").then((module) => ({ default: module.TicketPage })));

function GuestOnly({ children }: { children: React.ReactNode }) {
  if (getToken()) {
    return <Navigate to="/inbox" replace />;
  }
  return children;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#e8b86d",
          colorBgBase: "#12151c",
          colorBgContainer: "#1b2130",
          colorBorder: "#2a3348",
          borderRadius: 2,
          fontFamily: '"IBM Plex Sans", sans-serif',
        },
      }}
    >
      <BrowserRouter>
        <Suspense fallback={<div className="route-loading">正在装载工作台…</div>}>
          <Routes>
          <Route
            path="/login"
            element={
              <GuestOnly>
                <LoginPage />
              </GuestOnly>
            }
          />
          <Route
            path="/register"
            element={
              <GuestOnly>
                <RegisterPage />
              </GuestOnly>
            }
          />
          <Route element={<AppShell />}>
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/inbox/new" element={<NewTicketPage />} />
            <Route path="/inbox/:id" element={<TicketPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/audit" element={<AuditPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/inbox" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
);
