import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function readVersion(body: unknown): number {
  const version = Number((body as { version?: number } | undefined)?.version);
  if (!Number.isInteger(version) || version < 0) {
    throw new HttpError(400, "缺少版本号，请刷新页面后再操作");
  }
  return version;
}

export async function applyTicketChange(params: {
  id: number;
  expectedVersion: number;
  actorId: number;
  action: string;
  fromStatus: string;
  toStatus: string;
  data?: {
    status?: string;
    assigneeId?: number | null;
    category?: string | null;
  };
  detail?: Prisma.InputJsonValue;
  work?: (tx: Prisma.TransactionClient) => Promise<void>;
}) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.ticket.updateMany({
      where: { id: params.id, version: params.expectedVersion },
      data: {
        ...params.data,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      const exists = await tx.ticket.findUnique({
        where: { id: params.id },
        select: { id: true },
      });
      throw exists
        ? new HttpError(409, "这张单已被其他人改过，请刷新后再操作")
        : new HttpError(404, "工单不存在");
    }
    if (params.work) {
      await params.work(tx);
    }
    await tx.auditLog.create({
      data: {
        ticketId: params.id,
        actorId: params.actorId,
        action: params.action,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        detail: params.detail ?? {},
      },
    });
  });
}

export async function writeAudit(params: {
  actorId: number;
  action: string;
  ticketId?: number;
  fromStatus?: string | null;
  toStatus?: string | null;
  detail?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      ticketId: params.ticketId,
      fromStatus: params.fromStatus ?? null,
      toStatus: params.toStatus ?? null,
      detail: params.detail ?? {},
    },
  });
}
