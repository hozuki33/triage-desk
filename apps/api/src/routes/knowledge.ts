import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { indexDocument } from "../lib/knowledge.js";
import { writeAudit } from "../lib/ticket-lock.js";
import { evaluateRetrievalSuite } from "../lib/retrieval-evaluation.js";
import { CATEGORIES } from "../lib/categories.js";

export async function knowledgeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/api/knowledge", async (request, reply) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有管理员可以查看知识库" });
    }
    const docs = await prisma.knowledgeDoc.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        chunks: {
          take: 1,
          orderBy: { ordinal: "asc" },
          select: { embeddingProvider: true, embeddingModel: true, embeddingVersion: true, embeddedAt: true },
        },
      },
    });
    return {
      docs: docs.map(({ chunks, ...doc }) => ({
        ...doc,
        embedding: chunks[0]?.embeddingProvider ? chunks[0] : null,
      })),
    };
  });

  app.get("/api/knowledge/evaluation", async (request, reply) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有管理员可以运行检索评测" });
    }
    return { evaluation: await evaluateRetrievalSuite() };
  });

  app.post("/api/knowledge", async (request, reply) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有管理员可以上传知识库" });
    }
    const body = request.body as { title?: string; content?: string; category?: string | null };
    const title = body.title?.trim() ?? "";
    const content = body.content?.trim() ?? "";
    const category = body.category?.trim() || null;
    if (title.length < 2 || title.length > 120) {
      return reply.code(400).send({ message: "标题需要 2–120 个字符" });
    }
    if (content.length < 10) {
      return reply.code(400).send({ message: "正文太短，至少写清一条规则" });
    }
    if (content.length > 40_000) {
      return reply.code(400).send({ message: "单篇不超过 4 万字" });
    }
    if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      return reply.code(400).send({ message: "知识分类无效" });
    }

    const doc = await prisma.knowledgeDoc.create({
      data: { title, content, category, status: "indexing" },
    });
    await indexDocument(doc.id);
    await writeAudit({
      actorId: request.user.sub,
      action: "knowledge_create",
      detail: { title, category, docId: doc.id },
    });
    const indexed = await prisma.knowledgeDoc.findUniqueOrThrow({ where: { id: doc.id } });
    return reply.code(201).send({ doc: indexed });
  });

  app.post("/api/knowledge/reindex", async (request, reply) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有管理员可以重建知识索引" });
    }
    const body = (request.body ?? {}) as { ids?: unknown };
    if (
      body.ids !== undefined &&
      (!Array.isArray(body.ids) || body.ids.length > 200 || body.ids.some((id) => !Number.isInteger(id) || Number(id) <= 0))
    ) {
      return reply.code(400).send({ message: "ids 必须是不超过 200 项的正整数数组" });
    }
    const ids = body.ids as number[] | undefined;
    const docs = await prisma.knowledgeDoc.findMany({
      where: ids ? { id: { in: ids } } : undefined,
      select: { id: true, title: true },
      orderBy: { id: "asc" },
    });
    const results = [];
    for (const doc of docs) {
      await prisma.knowledgeDoc.update({ where: { id: doc.id }, data: { status: "indexing", indexErrorCode: null } });
      results.push({ id: doc.id, title: doc.title, ...(await indexDocument(doc.id)) });
    }
    await writeAudit({
      actorId: request.user.sub,
      action: "knowledge_reindex",
      detail: {
        requested: ids?.length ?? "all",
        processed: results.length,
        vectorReady: results.filter((result) => result.status === "ready").length,
      },
    });
    return { results };
  });

  app.delete("/api/knowledge/:id", async (request, reply) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有管理员可以删除知识库" });
    }
    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.knowledgeDoc.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ message: "文档不存在" });
    }
    await prisma.knowledgeDoc.delete({ where: { id } });
    await writeAudit({
      actorId: request.user.sub,
      action: "knowledge_delete",
      detail: { title: existing.title, docId: id },
    });
    return { ok: true };
  });
}
