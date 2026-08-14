import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { indexDocument } from "../lib/knowledge.js";
import { writeAudit } from "../lib/ticket-lock.js";

export async function knowledgeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/api/knowledge", async (request, reply) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有管理员可以查看知识库" });
    }
    const docs = await prisma.knowledgeDoc.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return { docs };
  });

  app.post("/api/knowledge", async (request, reply) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有管理员可以上传知识库" });
    }
    const body = request.body as { title?: string; content?: string };
    const title = body.title?.trim() ?? "";
    const content = body.content?.trim() ?? "";
    if (title.length < 2 || title.length > 120) {
      return reply.code(400).send({ message: "标题需要 2–120 个字符" });
    }
    if (content.length < 10) {
      return reply.code(400).send({ message: "正文太短，至少写清一条规则" });
    }
    if (content.length > 40_000) {
      return reply.code(400).send({ message: "单篇不超过 4 万字" });
    }

    const doc = await prisma.knowledgeDoc.create({
      data: { title, content, status: "indexing" },
    });
    await indexDocument(doc.id);
    await writeAudit({
      actorId: request.user.sub,
      action: "knowledge_create",
      detail: { title, docId: doc.id },
    });
    const indexed = await prisma.knowledgeDoc.findUniqueOrThrow({ where: { id: doc.id } });
    return reply.code(201).send({ doc: indexed });
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
