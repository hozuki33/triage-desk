import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function userRoutes(app: FastifyInstance) {
  app.get(
    "/api/users/agents",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (request.user.role !== "admin") {
        return reply.code(403).send({ message: "只有管理员可以查看客服名单" });
      }
      const agents = await prisma.user.findMany({
        where: { role: { in: ["agent", "admin"] } },
        select: { id: true, username: true, role: true },
        orderBy: { username: "asc" },
      });
      return { agents };
    },
  );
}
