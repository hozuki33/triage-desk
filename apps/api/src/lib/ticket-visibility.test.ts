import assert from "node:assert/strict";
import test from "node:test";
import { rejectAssignment, ticketWhere } from "./ticket-visibility.js";

test("rejecting a draft assigns unowned work to the reviewing staff member", () => {
  assert.deepEqual(rejectAssignment(2), { assigneeId: 2 });
});

test("agent visibility includes own tickets and only queue-safe unassigned statuses", () => {
  assert.deepEqual(ticketWhere({ sub: 2, role: "agent" }), {
    OR: [
      { assigneeId: 2 },
      {
        assigneeId: null,
        status: { in: ["pending", "pending_classify", "classify_failed", "pending_confirm"] },
      },
    ],
  });
});
