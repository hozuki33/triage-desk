import { Button, Select, Space, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, categoryLabel, statusLabel, type Ticket, type TicketStatus } from "../api";

const statusColor: Record<TicketStatus, string> = {
  pending_classify: "purple",
  classify_failed: "red",
  pending: "gold",
  in_progress: "blue",
  pending_confirm: "orange",
  replied: "green",
  closed: "default",
};

export function InboxPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  async function load(nextStatus?: string) {
    setLoading(true);
    try {
      const data = await api.tickets(nextStatus);
      setTickets(data.tickets);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(status);
  }, [status]);

  return (
    <>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <Typography.Title level={2} style={{ margin: 0, fontFamily: "Instrument Serif, serif" }}>
            收件匣
          </Typography.Title>
          <Typography.Text type="secondary">提单后 Agent 会分类并起草，客服在确认卡里审核再发送。</Typography.Text>
        </div>
        <Space>
          <Select
            allowClear
            placeholder="全部状态"
            style={{ width: 140 }}
            value={status}
            onChange={setStatus}
            options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))}
          />
          <Button type="primary" onClick={() => navigate("/inbox/new")}>
            开一张新单
          </Button>
        </Space>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={tickets}
        onRow={(row) => ({ onClick: () => navigate(`/inbox/${row.id}`) })}
        columns={[
          {
            title: "NO.",
            dataIndex: "id",
            width: 90,
            render: (id: number) => (
              <Typography.Text style={{ fontFamily: "IBM Plex Mono, monospace" }}>
                {String(id).padStart(4, "0")}
              </Typography.Text>
            ),
          },
          { title: "标题", dataIndex: "title" },
          {
            title: "分类",
            dataIndex: "category",
            width: 110,
            render: (value: string | null) => (value ? categoryLabel[value] ?? value : "—"),
          },
          {
            title: "状态",
            dataIndex: "status",
            width: 110,
            render: (value: TicketStatus) => <Tag color={statusColor[value]}>{statusLabel[value]}</Tag>,
          },
          { title: "来访", dataIndex: ["author", "username"], width: 120 },
          {
            title: "客服",
            dataIndex: ["assignee", "username"],
            width: 120,
            render: (name: string | undefined) => name ?? "未派",
          },
        ]}
      />
    </>
  );
}
