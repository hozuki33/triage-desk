import { Button, Card, Form, Input, Modal, Progress, Select, Space, Table, Tag, Typography, Upload, message } from "antd";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, categoryLabel, type KnowledgeDoc, type RetrievalEvaluationSuite } from "../api";
import { getUser } from "../session";

export function KnowledgePage() {
  const me = getUser();
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [evaluation, setEvaluation] = useState<RetrievalEvaluationSuite | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [form] = Form.useForm<{ title: string; content: string; category?: string }>();

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
            loading={reindexing}
            onClick={() => {
              setReindexing(true);
              void api
                .reindexKnowledge()
                .then(async (data) => {
                  const vectorReady = data.results.filter((item) => item.status === "ready").length;
                  message.success(`已重建 ${data.results.length} 篇，${vectorReady} 篇向量就绪`);
                  await load();
                })
                .catch((err) => message.error(err instanceof Error ? err.message : "重建失败"))
                .finally(() => setReindexing(false));
            }}
          >
            重建向量索引
          </Button>
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
        <Card title="检索评测对照" style={{ marginBottom: 16 }}>
          <Space size="middle" align="start" wrap>
            {(["lexical", "vector", "hybrid"] as const).map((mode) => {
              const result = evaluation.modes[mode];
              const label = mode === "lexical" ? "关键词基线" : mode === "vector" ? "纯向量" : "混合 RAG";
              return (
                <Card key={mode} size="small" title={label} style={{ width: 280 }}>
                  <Space align="start">
                    <Progress type="circle" size={68} percent={Math.round(result.accuracy * 100)} />
                    <div>
                      <Typography.Text strong>{result.passed}/{result.total} 通过</Typography.Text>
                      <Typography.Paragraph type="secondary" style={{ margin: "5px 0 0", fontSize: 12 }}>
                        Top-1 {Math.round(result.relevantTop1Accuracy * 100)}% · Hit@3 {Math.round(result.hitAt3 * 100)}%
                        <br />MRR {result.meanReciprocalRank.toFixed(2)} · 拒答 {Math.round(result.rejectionAccuracy * 100)}%
                        <br />平均 {result.averageLatencyMs.toFixed(1)} ms
                      </Typography.Paragraph>
                    </div>
                  </Space>
                </Card>
              );
            })}
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
            title: "业务分类",
            dataIndex: "category",
            width: 120,
            render: (value: string | null) => value ? <Tag>{categoryLabel[value] ?? value}</Tag> : <Typography.Text type="secondary">通用</Typography.Text>,
          },
          {
            title: "状态",
            dataIndex: "status",
            width: 110,
            render: (value: string, row: KnowledgeDoc) => (
              <Space direction="vertical" size={2}>
                <Tag color={value === "ready" ? "green" : value === "ready_lexical" ? "gold" : "blue"}>
                  {value === "ready" ? "向量就绪" : value === "ready_lexical" ? "仅关键词" : "索引中"}
                </Tag>
                {row.indexErrorCode ? <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.indexErrorCode}</Typography.Text> : null}
              </Space>
            ),
          },
          {
            title: "Embedding",
            width: 230,
            render: (_: unknown, row: KnowledgeDoc) => row.embedding?.embeddingModel ? (
              <div>
                <Typography.Text>{row.embedding.embeddingModel}</Typography.Text>
                <br />
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.embedding.embeddingVersion}</Typography.Text>
              </div>
            ) : <Typography.Text type="secondary">未生成</Typography.Text>,
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
              await api.createKnowledge(values.title, values.content, values.category);
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
          <Form.Item name="category" label="业务分类（用于 Agent 元数据过滤）">
            <Select
              allowClear
              placeholder="不选则作为通用知识"
              options={Object.entries(categoryLabel).map(([value, label]) => ({ value, label }))}
            />
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
