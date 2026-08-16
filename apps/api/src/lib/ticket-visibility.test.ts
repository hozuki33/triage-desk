import assert from "node:assert/strict";
import test from "node:test";
import { rejectAssignment, ticketMutationWhere, ticketWhere } from "./ticket-visibility.js";

test("rejecting a draft assigns unowned work to the reviewing staff member", () => {
  assert.deepEqual(rejectAssignment(2), { assigneeId: 2 });
});

test("completed team history does not expand agent mutation scope", () => {
  assert.deepEqual(ticketMutationWhere({ sub: 2, role: "agent" }), {
    OR: [
      { assigneeId: 2 },
      {
        assigneeId: null,
        status: { in: ["pending", "pending_classify", "classify_failed", "pending_confirm"] },
      },
    ],
  });
});

test("agent visibility includes own work, queue-safe unassigned work, and completed team history", () => {
  assert.deepEqual(ticketWhere({ sub: 2, role: "agent" }), {
    OR: [
      { assigneeId: 2 },
      {
        assigneeId: null,
        status: { in: ["pending", "pending_classify", "classify_failed", "pending_confirm"] },
      },
      { status: { in: ["replied", "closed"] } },
    ],
  });
});
