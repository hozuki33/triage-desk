import assert from "node:assert/strict";
import test from "node:test";
import { getAllowedActions, transition } from "./ticket-state.js";

test("a degraded classification can be rerun by an agent", () => {
  assert.equal(transition("classify_failed", "agent_fail"), "classify_failed");
  assert.equal(transition("classify_failed", "agent_ok"), "pending_confirm");
  assert.ok(
    getAllowedActions({ status: "classify_failed", role: "agent", isAuthor: false }).includes("run_agent"),
  );
});

test("a draft-provider failure from in-progress routes to human review", () => {
  assert.equal(transition("in_progress", "agent_fail"), "classify_failed");
});

test("a visitor cannot run the agent or confirm a draft", () => {
  const actions = getAllowedActions({ status: "pending_confirm", role: "user", isAuthor: true });
  assert.equal(actions.includes("run_agent"), false);
  assert.equal(actions.includes("confirm_reply"), false);
});
