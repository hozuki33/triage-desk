import { prisma } from "../src/lib/prisma.js";

try {
  const rows = await prisma.$queryRaw<Array<{ extversion: string }>>`
    SELECT extversion FROM pg_extension WHERE extname = 'vector'
  `;
  if (rows.length !== 1) throw new Error("pgvector extension is not enabled");
  const columns = await prisma.$queryRaw<Array<{ dataType: string }>>`
    SELECT format_type(atttypid, atttypmod) AS "dataType"
    FROM pg_attribute
    WHERE attrelid = '"KnowledgeChunk"'::regclass AND attname = 'embedding'
  `;
  if (columns[0]?.dataType !== "vector(512)") throw new Error("KnowledgeChunk.embedding is not vector(512)");
  console.log(JSON.stringify({ ok: true, pgvector: rows[0]?.extversion, dimensions: 512 }));
} finally {
  await prisma.$disconnect();
}
