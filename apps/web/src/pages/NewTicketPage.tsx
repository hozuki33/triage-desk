import { Button, Card, Form, Input, message } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export function NewTicketPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  return (
    <Card title="开新单">
      <Form
        layout="vertical"
        onFinish={async (values: { title: string; content: string }) => {
          setPending(true);
          try {
            const result = await api.createTicket(values.title, values.content);
            message.success(
              result.ticket.status === "pending_confirm" ? "Agent 已起草，请客服确认" : "已放入收件匣",
            );
            navigate(`/inbox/${result.ticket.id}`);
          } catch (err) {
            message.error(err instanceof Error ? err.message : "未能开单");
          } finally {
            setPending(false);
          }
        }}
      >
        <Form.Item name="title" label="标题" rules={[{ required: true, min: 2 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="content" label="详情" rules={[{ required: true, min: 4 }]}>
          <Input.TextArea rows={8} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={pending}>
          {pending ? "Agent 分类并起草中…" : "放入收件匣"}
        </Button>
        <Button style={{ marginLeft: 8 }} onClick={() => navigate("/inbox")}>
          返回
        </Button>
      </Form>
    </Card>
  );
}
