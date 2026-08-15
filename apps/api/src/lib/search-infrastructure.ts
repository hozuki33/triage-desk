import { prisma } from "./prisma.js";

let initialized: Promise<void> | undefined;

export function ensureSearchInfrastructure(): Promise<void> {
  initialized ??= (async () => {
    await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "KnowledgeChunk_content_trgm_idx" ON "KnowledgeChunk" USING gin (lower("content") gin_trgm_ops)',
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "KnowledgeDoc_title_trgm_idx" ON "KnowledgeDoc" USING gin (lower("title") gin_trgm_ops)',
    );
  })();
  return initialized;
}
