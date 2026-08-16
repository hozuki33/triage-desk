import { prisma } from "../src/lib/prisma.js";
import { indexDocument } from "../src/lib/knowledge.js";

const docs = await prisma.knowledgeDoc.findMany({ select: { id: true, title: true } });
let ready = 0;
let lexicalOnly = 0;
try {
  for (const doc of docs) {
    const result = await indexDocument(doc.id);
    if (result.status === "ready") ready += 1;
    else lexicalOnly += 1;
    console.log(`${doc.title}: ${result.status} (${result.chunkCount} chunks)`);
  }
  console.log(`Reindexed ${docs.length} documents: ${ready} vector-ready, ${lexicalOnly} lexical fallback`);
} finally {
  await prisma.$disconnect();
}
