import bcrypt from "bcryptjs";
import { indexDocument } from "../src/lib/knowledge.js";
import { prisma } from "../src/lib/prisma.js";

const passwordHash = await bcrypt.hash("desk-2026", 10);

const seeds = [
  { username: "admin", role: "admin" },
  { username: "agent", role: "agent" },
  { username: "user", role: "user" },
] as const;

for (const seed of seeds) {
  await prisma.user.upsert({
    where: { username: seed.username },
    update: process.env.RESET_DEMO_PASSWORDS === "true" ? { role: seed.role, passwordHash } : { role: seed.role },
    create: { username: seed.username, role: seed.role, passwordHash },
  });
}

const visitor = await prisma.user.findUnique({ where: { username: "user" } });
if (visitor) {
  const existing = await prisma.ticket.findFirst({ where: { authorId: visitor.id } });
  if (!existing) {
    await prisma.ticket.create({
      data: {
        title: "退款还没到账",
        content: "我三天前申请退款，卡上还没有这笔钱。订单号 8821。",
        authorId: visitor.id,
      },
    });
  }
}

const knowledgeSeeds = [
  {
    title: "退款时效说明",
    category: "refund_issue",
    content: `原路退回：审核通过后 3 个工作日内到账；银行卡到账可能再延迟 1–2 天。
用户必须提供订单号，客服才能发起核查。
超过 7 个工作日仍未到账，可升级财务排查。
已发货订单需先确认退货入库，再启动退款，不能承诺当天到账。`,
  },
  {
    title: "物流延误处理规范",
    category: "delivery_delay",
    content: `超过承诺时效 48 小时未签收，可申请催派。
物流超过 5 天无更新，用户可选择补发或退款，二者择一。
签收后发现破损或少件，走产品质量通道，不按物流延误处理。`,
  },
];

for (const item of knowledgeSeeds) {
  const existing = await prisma.knowledgeDoc.findFirst({ where: { title: item.title } });
  const doc = existing
    ? await prisma.knowledgeDoc.update({
        where: { id: existing.id },
        data: { content: item.content, category: item.category, status: "indexing" },
      })
    : await prisma.knowledgeDoc.create({
        data: { title: item.title, content: item.content, category: item.category, status: "indexing" },
      });
  await indexDocument(doc.id);
}

await prisma.$disconnect();
console.log("Ensured admin / agent / user accounts (new accounts use password: desk-2026; existing passwords preserved)");
console.log("Seeded knowledge: 退款时效说明 / 物流延误处理规范");
