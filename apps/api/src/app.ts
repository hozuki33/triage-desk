import Fastify from "fastify";
import cors from "@fastify/cors";
import jwtPlugin from "./plugins/jwt.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { ticketRoutes } from "./routes/tickets.js";
import { userRoutes } from "./routes/users.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { auditRoutes } from "./routes/audit.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      process.env.PUBLIC_ORIGIN,
    ].filter(Boolean) as string[],
  });
  await app.register(jwtPlugin);
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(ticketRoutes);
  await app.register(userRoutes);
  await app.register(knowledgeRoutes);
  await app.register(auditRoutes);

  return app;
}
