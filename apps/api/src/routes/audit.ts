import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function auditRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/api/audit", async (request, reply) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有管理员可以查看审计" });
    }
    const query = request.query as { ticketId?: string; page?: string; pageSize?: string };
    const ticketId = query.ticketId ? Number(query.ticketId) : undefined;
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(10, Number(query.pageSize) || 20));
    const where = ticketId && Number.isInteger(ticketId) ? { ticketId } : {};

    const [items, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          actor: { select: { id: true, username: true, role: true } },
          ticket: { select: { id: true, title: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  });
}
