import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { llmConfigurationStatus } from "../agent/llm-config.js";
import { embeddingConfigurationStatus } from "../rag/embedding.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/api/health", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        ok: true,
        service: "triage-desk",
        dependencies: {
          database: "ok",
          retrieval: "hybrid_pgvector_rrf",
          embedding: embeddingConfigurationStatus(),
          llm: llmConfigurationStatus(),
        },
      };
    } catch {
      return reply.code(503).send({
        ok: false,
        service: "triage-desk",
        dependencies: { database: "unavailable" },
      });
    }
  });
}
