import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./App";
import { InboxPage } from "./pages/InboxPage";
import { LoginPage } from "./pages/LoginPage";
import { NewTicketPage } from "./pages/NewTicketPage";
import { RegisterPage } from "./pages/RegisterPage";
import { KnowledgePage } from "./pages/KnowledgePage";
import { AuditPage } from "./pages/AuditPage";
import { TicketPage } from "./pages/TicketPage";
import { getToken } from "./session";
import "./styles.css";

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
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
);
