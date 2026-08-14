import { Button, Card, Form, Input, Typography, message } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { saveSession } from "../session";

export function LoginPage() {
  const navigate = useNavigate();

  return (
    <Card className="auth-card">
      <Typography.Title level={2} style={{ fontFamily: "Instrument Serif, serif" }}>
        上夜班
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        种子账号 admin / agent / user，密码 desk-2026。
      </Typography.Paragraph>
      <Form
        layout="vertical"
        initialValues={{ username: "agent", password: "desk-2026" }}
        onFinish={async (values: { username: string; password: string }) => {
          try {
            const result = await api.login(values.username, values.password);
            saveSession(result.token, result.user);
            navigate("/inbox");
          } catch (err) {
            message.error(err instanceof Error ? err.message : "登录失败");
          }
        }}
      >
        <Form.Item name="username" label="工号" rules={[{ required: true, min: 3 }]}>
          <Input autoComplete="username" />
        </Form.Item>
        <Form.Item name="password" label="口令" rules={[{ required: true, min: 6 }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block>
          进入收件匣
        </Button>
      </Form>
      <Typography.Paragraph style={{ marginTop: 16 }}>
        没有工号？<Link to="/register">登记一张</Link>
      </Typography.Paragraph>
    </Card>
  );
}
