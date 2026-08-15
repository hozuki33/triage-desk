import { Button, Card, Form, Input, Modal, Progress, Space, Table, Tag, Typography, Upload, message } from "antd";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, type KnowledgeDoc, type RetrievalEvaluation } from "../api";
import { getUser } from "../session";

export function KnowledgePage() {
  const me = getUser();
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [evaluation, setEvaluation] = useState<RetrievalEvaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [form] = Form.useForm<{ title: string; content: string }>();

  async function load() {
    setLoading(true);
    try {
      const data = await api.knowledge();
      setDocs(data.docs);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "无法加载知识库");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (me?.role !== "admin") {
    return <Navigate to="/inbox" replace />;
  }

  return (
    <>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <Typography.Title level={2} style={{ margin: 0, fontFamily: "Instrument Serif, serif" }}>
            知识库
          </Typography.Title>
          <Typography.Text type="secondary">
            上传条文后会切分入库。Agent 起草时检索片段并写进确认卡，来访看不到原文库。
          </Typography.Text>
        </div>
        <Space>
          <Button
            loading={evaluating}
            onClick={() => {
              setEvaluating(true);
              void api
                .evaluateKnowledge()
                .then((data) => setEvaluation(data.evaluation))
                .catch((err) => message.error(err instanceof Error ? err.message : "评测失败"))
                .finally(() => setEvaluating(false));
            }}
          >
            运行检索评测
          </Button>
          <Button type="primary" onClick={() => setOpen(true)}>
            录入条文
          </Button>
        </Space>
      </Space>
      {evaluation ? (
        <Card title="检索评测" style={{ marginBottom: 16 }}>
          <Space size="large" wrap>
            <Progress type="circle" size={88} percent={Math.round(evaluation.accuracy * 100)} />
            <div>
              <Typography.Text strong>
                {evaluation.passed}/{evaluation.total} 用例通过
              </Typography.Text>
              <Typography.Paragraph type="secondary" style={{ margin: "6px 0 0" }}>
                相关问题 Top-1 {Math.round(evaluation.relevantTop1Accuracy * 100)}% · 无关问题拒绝率 {Math.round(evaluation.rejectionAccuracy * 100)}%
              </Typography.Paragraph>
            </div>
          </Space>
        </Card>
      ) : null}
      <Table
        rowKey="id"
        loading={loading}
        dataSource={docs}
        columns={[
          { title: "标题", dataIndex: "title" },
          {
            title: "状态",
            dataIndex: "status",
            width: 110,
            render: (value: string) => <Tag color={value === "ready" ? "green" : "gold"}>{value}</Tag>,
          },
          { title: "切分数", dataIndex: "chunkCount", width: 100 },
          {
            title: "更新",
            dataIndex: "updatedAt",
            width: 180,
            render: (value: string) => new Date(value).toLocaleString(),
          },
          {
            title: "",
            width: 90,
            render: (_: unknown, row: KnowledgeDoc) => (
              <Button
                danger
                size="small"
                onClick={() => {
                  void api
                    .deleteKnowledge(row.id)
                    .then(() => {
                      message.success("已删除");
                      return load();
                    })
                    .catch((err) => message.error(err instanceof Error ? err.message : "删除失败"));
                }}
              >
                删除
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title="录入知识条文"
        open={open}
        confirmLoading={pending}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            setPending(true);
            try {
              await api.createKnowledge(values.title, values.content);
              message.success("已切分入库");
              setOpen(false);
              form.resetFields();
              await load();
            } catch (err) {
              message.error(err instanceof Error ? err.message : "上传失败");
            } finally {
              setPending(false);
            }
          }}
        >
          <Form.Item name="title" label="标题" rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="content" label="正文" rules={[{ required: true, min: 10 }]}>
            <Input.TextArea rows={10} placeholder="粘贴 txt / markdown 条文" />
          </Form.Item>
          <Upload
            accept=".txt,.md"
            showUploadList={false}
            beforeUpload={(file) => {
              void file.text().then((text) => {
                form.setFieldsValue({
                  title: form.getFieldValue("title") || file.name.replace(/\.(txt|md)$/i, ""),
                  content: text,
                });
              });
              return false;
            }}
          >
            <Button>从文件读入</Button>
          </Upload>
        </Form>
      </Modal>
    </>
  );
}
