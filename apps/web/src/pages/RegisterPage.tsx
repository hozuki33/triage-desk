import { Button, Card, Form, Input, Typography, message } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { saveSession } from "../session";

export function RegisterPage() {
  const navigate = useNavigate();

  return (
    <Card className="auth-card">
      <Typography.Title level={2} style={{ fontFamily: "Instrument Serif, serif" }}>
        登记工号
      </Typography.Title>
      <Typography.Paragraph type="secondary">新账号默认是来访者。</Typography.Paragraph>
      <Form
        layout="vertical"
        onFinish={async (values: { username: string; password: string }) => {
          try {
            const result = await api.register(values.username, values.password);
            saveSession(result.token, result.user);
            navigate("/inbox");
          } catch (err) {
            message.error(err instanceof Error ? err.message : "登记失败");
          }
        }}
      >
        <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3 }]}>
          <Input autoComplete="username" />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, min: 6 }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block>
          登记并进入
        </Button>
      </Form>
      <Typography.Paragraph style={{ marginTop: 16 }}>
        已有工号？<Link to="/login">去登录</Link>
      </Typography.Paragraph>
    </Card>
  );
}
