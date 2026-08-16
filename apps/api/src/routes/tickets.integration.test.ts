import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { hashPassword } from "../lib/hash.js";
import { prisma } from "../lib/prisma.js";

const integrationDatabase = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1) : "";
if (!/^triage_desk_test_[a-f0-9]{12}$/.test(integrationDatabase)) {
  throw new Error("Integration tests require an isolated triage_desk_test_<random> database");
}

let app: FastifyInstance;
let adminId: number;
let agentId: number;
let visitorAId: number;
let visitorBId: number;
let agentToken: string;
let adminToken: string;
let visitorAToken: string;
let visitorBToken: string;
const usernames = ["itest_admin", "itest_agent", "itest_visitor_a", "itest_visitor_b"];

async function login(username: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password: "itest-password" },
  });
  assert.equal(response.statusCode, 200);
  return response.json<{ token: string }>().token;
}

before(async () => {
  await prisma.auditLog.deleteMany({ where: { actor: { username: { in: usernames } } } });
  await prisma.ticket.deleteMany({ where: { author: { username: { in: usernames } } } });
  await prisma.user.deleteMany({ where: { username: { in: usernames } } });
  const passwordHash = await hashPassword("itest-password");
  const [admin, agent, visitorA, visitorB] = await Promise.all([
    prisma.user.create({ data: { username: usernames[0], role: "admin", passwordHash } }),
    prisma.user.create({ data: { username: usernames[1], role: "agent", passwordHash } }),
    prisma.user.create({ data: { username: usernames[2], role: "user", passwordHash } }),
    prisma.user.create({ data: { username: usernames[3], role: "user", passwordHash } }),
  ]);
  adminId = admin.id;
  agentId = agent.id;
  visitorAId = visitorA.id;
  visitorBId = visitorB.id;
  app = await buildApp();
  adminToken = await login(usernames[0]);
  agentToken = await login(usernames[1]);
  visitorAToken = await login(usernames[2]);
  visitorBToken = await login(usernames[3]);
});

after(async () => {
  await app.close();
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [adminId, agentId, visitorAId, visitorBId] } } });
  await prisma.ticket.deleteMany({ where: { authorId: { in: [visitorAId, visitorBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, agentId, visitorAId, visitorBId] } } });
  await prisma.$disconnect();
});

test("rejecting an unassigned draft keeps the ticket visible in the agent in-progress list", async () => {
  const ticket = await prisma.ticket.create({
    data: {
      title: "integration reject visibility",
      content: "integration fixture content",
      status: "pending_confirm",
      version: 0,
      authorId: visitorAId,
      replies: { create: { content: "fixture draft", source: "rules" } },
    },
  });

  const rejected = await app.inject({
    method: "POST",
    url: `/api/tickets/${ticket.id}/reject`,
    headers: { authorization: `Bearer ${agentToken}` },
    payload: { version: 0 },
  });
  assert.equal(rejected.statusCode, 200);
  const rejectedTicket = rejected.json<{ ticket: { status: string; assigneeId: number; version: number } }>().ticket;
  assert.equal(rejectedTicket.status, "in_progress");
  assert.equal(rejectedTicket.assigneeId, agentId);

  const filtered = await app.inject({
    method: "GET",
    url: "/api/tickets?status=in_progress",
    headers: { authorization: `Bearer ${agentToken}` },
  });
  assert.equal(filtered.statusCode, 200);
  assert.ok(filtered.json<{ tickets: Array<{ id: number }> }>().tickets.some((item) => item.id === ticket.id));

  const stale = await app.inject({
    method: "POST",
    url: `/api/tickets/${ticket.id}/close`,
    headers: { authorization: `Bearer ${agentToken}` },
    payload: { version: 0 },
  });
  assert.equal(stale.statusCode, 409);

  const audit = await prisma.auditLog.findFirst({ where: { ticketId: ticket.id, action: "reject_draft" } });
  assert.equal(audit?.actorId, agentId);
});

test("HTTP creation runs the Agent pipeline and confirmation exposes the final reply to its visitor", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/api/tickets",
    headers: { authorization: `Bearer ${visitorAToken}` },
    payload: { title: "物流五天没有更新", content: "订单 IT-HTTP-1 的物流五天没有更新，请协助处理。" },
  });
  assert.equal(created.statusCode, 201);
  const createdTicket = created.json<{ ticket: { id: number; status: string; version: number; replies: unknown[] } }>().ticket;
  assert.equal(createdTicket.status, "pending_confirm");
  assert.equal(createdTicket.replies.length, 0);

  const confirmed = await app.inject({
    method: "POST",
    url: `/api/tickets/${createdTicket.id}/confirm`,
    headers: { authorization: `Bearer ${agentToken}` },
    payload: { version: createdTicket.version },
  });
  assert.equal(confirmed.statusCode, 200);
  assert.equal(confirmed.json<{ ticket: { status: string } }>().ticket.status, "replied");

  const visitorView = await app.inject({
    method: "GET",
    url: `/api/tickets/${createdTicket.id}`,
    headers: { authorization: `Bearer ${visitorAToken}` },
  });
  assert.equal(visitorView.statusCode, 200);
  const visible = visitorView.json<{ ticket: { replies: Array<{ source: string; content: string }> } }>().ticket.replies;
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.source, "human");
  assert.ok((visible[0]?.content.length ?? 0) > 20);
});

test("a visitor cannot read another visitor's ticket", async () => {
  const ticket = await prisma.ticket.create({
    data: { title: "private fixture", content: "belongs to visitor A", authorId: visitorAId },
  });
  const response = await app.inject({
    method: "GET",
    url: `/api/tickets/${ticket.id}`,
    headers: { authorization: `Bearer ${visitorBToken}` },
  });
  assert.equal(response.statusCode, 404);
});

test("an agent can read admin-completed team history but cannot mutate it", async () => {
  const ticket = await prisma.ticket.create({
    data: {
      title: "admin completed history",
      content: "completed by a different staff member",
      status: "replied",
      version: 1,
      authorId: visitorAId,
      assigneeId: adminId,
      replies: { create: { content: "completed response", source: "human" } },
    },
  });

  const listed = await app.inject({
    method: "GET",
    url: "/api/tickets?status=replied",
    headers: { authorization: `Bearer ${agentToken}` },
  });
  assert.equal(listed.statusCode, 200);
  const history = listed
    .json<{ tickets: Array<{ id: number; allowedActions: string[] }> }>()
    .tickets.find((item) => item.id === ticket.id);
  assert.ok(history);
  assert.deepEqual(history.allowedActions, []);

  const detail = await app.inject({
    method: "GET",
    url: `/api/tickets/${ticket.id}`,
    headers: { authorization: `Bearer ${agentToken}` },
  });
  assert.equal(detail.statusCode, 200);

  const close = await app.inject({
    method: "POST",
    url: `/api/tickets/${ticket.id}/close`,
    headers: { authorization: `Bearer ${agentToken}` },
    payload: { version: 1 },
  });
  assert.equal(close.statusCode, 404);
});

test("health reports database and retrieval readiness without secrets", async () => {
  const response = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(response.statusCode, 200);
  const payload = response.json<{
    ok: boolean;
    dependencies: { database: string; retrieval: string; embedding: string; llm: string };
  }>();
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.dependencies, {
    database: "ok",
    retrieval: "hybrid_pgvector_rrf",
    embedding: "disabled",
    llm: "rules_only",
  });
  assert.equal(JSON.stringify(payload).includes("sk-"), false);
});

test("knowledge HTTP indexing records an honest lexical fallback when embedding is disabled", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/api/knowledge",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      title: "集成测试知识",
      content: "退款审核通过后通常在三个工作日内退回原支付银行卡。",
    },
  });
  assert.equal(created.statusCode, 201);
  const doc = created.json<{ doc: { id: number; status: string; chunkCount: number } }>().doc;
  assert.equal(doc.status, "ready_lexical");
  assert.equal(doc.chunkCount, 1);

  const rebuilt = await app.inject({
    method: "POST",
    url: "/api/knowledge/reindex",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { ids: [doc.id] },
  });
  assert.equal(rebuilt.statusCode, 200);
  assert.equal(rebuilt.json<{ results: Array<{ status: string }> }>().results[0]?.status, "ready_lexical");

  const listed = await app.inject({
    method: "GET",
    url: "/api/knowledge",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const indexed = listed.json<{ docs: Array<{ id: number; embedding: unknown }> }>().docs.find((item) => item.id === doc.id);
  assert.equal(indexed?.embedding, null);

  const removed = await app.inject({
    method: "DELETE",
    url: `/api/knowledge/${doc.id}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(removed.statusCode, 200);
});
