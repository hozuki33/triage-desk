import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/hash.js";

function publicUser(user: { id: number; username: string; role: string }) {
  return { id: user.id, username: user.username, role: user.role };
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/register", async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    if (username.length < 3 || username.length > 32) {
      return reply.code(400).send({ message: "用户名需要 3–32 个字符" });
    }
    if (password.length < 6) {
      return reply.code(400).send({ message: "密码至少 6 位" });
    }

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return reply.code(409).send({ message: "用户名已被占用" });
    }

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await hashPassword(password),
        role: "user",
      },
    });

    const token = await reply.jwtSign({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    return reply.code(201).send({ token, user: publicUser(user) });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ message: "用户名或密码不正确" });
    }

    const token = await reply.jwtSign({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    return { token, user: publicUser(user) };
  });

  app.get(
    "/api/auth/me",
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
      });
      if (!user) {
        return { user: null };
      }
      return { user: publicUser(user) };
    },
  );
}
