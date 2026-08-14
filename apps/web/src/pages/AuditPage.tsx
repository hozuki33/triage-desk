import { InputNumber, Space, Table, Tag, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { actionLabel, api, statusLabel, type AuditLog, type TicketStatus } from "../api";
import { getUser } from "../session";

export function AuditPage() {
  const me = getUser();
  const [items, setItems] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(nextPage = page, nextTicketId = ticketId) {
    setLoading(true);
    try {
      const data = await api.audit({
        page: nextPage,
        pageSize: 20,
        ticketId: nextTicketId ?? undefined,
      });
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "无法加载审计");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1, ticketId);
  }, [ticketId]);

  if (me?.role !== "admin") {
    return <Navigate to="/inbox" replace />;
  }

  return (
    <>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <Typography.Title level={2} style={{ margin: 0, fontFamily: "Instrument Serif, serif" }}>
            审计
          </Typography.Title>
          <Typography.Text type="secondary">
            每次改状态都落库。并发用版本号卡住：两个人同时确认，只有一个能成功。
          </Typography.Text>
        </div>
        <InputNumber
          min={1}
          placeholder="工单号"
          value={ticketId ?? undefined}
          onChange={(value) => {
            setTicketId(typeof value === "number" ? value : null);
            setPage(1);
          }}
        />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          onChange: (next) => void load(next),
        }}
        columns={[
          {
            title: "时间",
            dataIndex: "createdAt",
            width: 180,
            render: (value: string) => new Date(value).toLocaleString(),
          },
          {
            title: "操作人",
            dataIndex: ["actor", "username"],
            width: 110,
          },
          {
            title: "动作",
            dataIndex: "action",
            width: 120,
            render: (value: string) => actionLabel[value] ?? value,
          },
          {
            title: "工单",
            width: 90,
            render: (_: unknown, row: AuditLog) =>
              row.ticket ? (
                <Link to={`/inbox/${row.ticket.id}`} style={{ fontFamily: "IBM Plex Mono, monospace" }}>
                  {String(row.ticket.id).padStart(4, "0")}
                </Link>
              ) : (
                "—"
              ),
          },
          {
            title: "状态",
            render: (_: unknown, row: AuditLog) => {
              const from = row.fromStatus ? statusLabel[row.fromStatus as TicketStatus] ?? row.fromStatus : "—";
              const to = row.toStatus ? statusLabel[row.toStatus as TicketStatus] ?? row.toStatus : "—";
              return (
                <span>
                  {from} <Tag style={{ marginInline: 6 }}>→</Tag> {to}
                </span>
              );
            },
          },
        ]}
      />
    </>
  );
}
