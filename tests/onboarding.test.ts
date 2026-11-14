import test from "node:test";
import assert from "node:assert/strict";
import {
  seedTestWorkspace,
  testAccount,
  testAccounts,
} from "../lib/test-workspace";
import { visible, reduce } from "../lib/demo";
import { guides } from "../lib/guide";
import type { Command } from "../lib/model";

test("test workspace contains three teams, one operator and two independently assigned judges", () => {
  const state = seedTestWorkspace();
  assert.equal(state.teams.length, 3);
  assert.equal(state.members.filter((m) => m.role === "operator").length, 1);
  assert.equal(state.members.filter((m) => m.role === "participant").length, 3);
  assert.equal(state.members.filter((m) => m.role === "judge").length, 2);
  assert.equal(state.submissions.length, 2);
  assert.equal(state.teams[2].submission_id, null);
  for (const account of testAccounts) {
    assert.equal(
      testAccount(account.role, ` ${account.credential.toUpperCase()} `)
        ?.user_id,
      account.user_id,
    );
    assert.equal(
      testAccount(
        account.role === "operator" ? "judge" : "operator",
        account.credential,
      ),
      undefined,
    );
  }
  const team = visible(state, "participant", "team-2", "participant-2");
  assert.equal(team.me.user_id, "participant-2");
  assert.deepEqual(
    team.teams.map((t) => t.id),
    ["team-2"],
  );
});

test("sample judges save separate reviews and see only their own evaluation", () => {
  let state = seedTestWorkspace();
  const command = (request_id: string): Command => ({
    kind: "review",
    request_id,
    event_id: state.event.id,
    payload: {
      team_id: "team-1",
      version: 0,
      rubric_id: state.event.current_rubric_id,
      scores: { innovation: 20 },
      notes: request_id,
      final: false,
    },
  });
  state = reduce(
    state,
    command("first"),
    "judge",
    Date.now(),
    undefined,
    "judge",
  );
  state = reduce(
    state,
    command("second"),
    "judge",
    Date.now(),
    undefined,
    "judge-2",
  );
  assert.equal(state.evaluations.length, 2);
  assert.equal(
    visible(state, "judge", undefined, "judge").evaluations[0].notes,
    "first",
  );
  assert.equal(
    visible(state, "judge", undefined, "judge-2").evaluations[0].notes,
    "second",
  );
  assert.equal(
    visible(state, "judge", undefined, "judge-2").evaluations.length,
    1,
  );
});

test("every manual and tour step has a stable ID and Korean and English instructions", () => {
  const steps = Object.values(guides).flat();
  assert.equal(new Set(steps.map((s) => s.id)).size, steps.length);
  for (const step of steps) {
    assert.ok(step.target.startsWith("[data-guide="));
    for (const lang of ["ko", "en"] as const) {
      assert.ok(step.title[lang].length);
      assert.ok(step.body[lang].length);
    }
  }
});
