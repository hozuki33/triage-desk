export type TicketViewer = { sub: number; role: string };

function agentWorkWhere(user: TicketViewer) {
  return {
    OR: [
      { assigneeId: user.sub },
      {
        assigneeId: null,
        status: { in: ["pending", "pending_classify", "classify_failed", "pending_confirm"] },
      },
    ],
  };
}

export function ticketWhere(user: TicketViewer) {
  if (user.role === "admin") return {};
  if (user.role === "agent") {
    return {
      OR: [
        { assigneeId: user.sub },
        {
          assigneeId: null,
          status: { in: ["pending", "pending_classify", "classify_failed", "pending_confirm"] },
        },
        { status: { in: ["replied", "closed"] } },
      ],
    };
  }
  return { authorId: user.sub };
}

export function ticketMutationWhere(user: TicketViewer) {
  if (user.role === "admin") return {};
  if (user.role === "agent") return agentWorkWhere(user);
  return { authorId: user.sub };
}

export function rejectAssignment(actorId: number) {
  return { assigneeId: actorId };
}
