import { test } from "node:test";
import assert from "node:assert/strict";
import { seed, reduce, visible } from "../lib/demo";
import {
  defaults,
  remainingMs,
  timerView,
  contrast,
  validateSettings,
  validateScores,
  slideKey,
  type Command,
  type Snapshot,
  type Role,
} from "../lib/model";
const command = (
  s: Snapshot,
  kind: string,
  payload: Record<string, unknown>,
): Command => ({
  kind,
  event_id: s.event.id,
  request_id: crypto.randomUUID(),
  payload,
});
function act(
  s: Snapshot,
  kind: string,
  p: Record<string, unknown>,
  role: Role = "operator",
  now = 100000,
) {
  return reduce(s, command(s, kind, p), role, now);
}
function start() {
  let s = seed();
  s = act(s, "start", { id: "session-1", team_id: "team-1" });
  s = act(s, "ready", { session_id: "session-1", version: 1 });
  return s;
}
test("slide movement changes page/version only; timer survives snapshots", () => {
  let s = start();
  const before = s.sessions[0];
  s = act(
    s,
    "move",
    { session_id: before.id, version: before.version, delta: 1 },
    "participant",
    110000,
  );
  assert.equal(s.sessions[0].current_page, 2);
  assert.equal(s.sessions[0].started_at, before.started_at);
  assert.equal(s.sessions[0].paused_ms, 0);
  assert.equal(
    remainingMs(JSON.parse(JSON.stringify(s.sessions[0])), 115000),
    405000,
  );
});
test("pause, resume, reset and end preserve timer invariants", () => {
  let s = start();
  s = act(
    s,
    "pause",
    { session_id: "session-1", version: 2 },
    "operator",
    110000,
  );
  assert.equal(remainingMs(s.sessions[0], 999999), 410000);
  s = act(
    s,
    "resume",
    { session_id: "session-1", version: 3 },
    "operator",
    130000,
  );
  assert.equal(s.sessions[0].paused_ms, 20000);
  assert.equal(remainingMs(s.sessions[0], 140000), 400000);
  s = act(
    s,
    "reset",
    { session_id: "session-1", version: 4 },
    "operator",
    140000,
  );
  assert.equal(remainingMs(s.sessions[0], 141000), 419000);
  s = act(
    s,
    "end",
    { session_id: "session-1", version: 5 },
    "operator",
    150000,
  );
  assert.equal(remainingMs(s.sessions[0], 999999), 410000);
  assert.throws(
    () =>
      act(
        s,
        "move",
        { session_id: "session-1", version: 6, delta: 1 },
        "participant",
      ),
    /종료/,
  );
});
test("one active session; stale version and page boundaries rejected", () => {
  const s = start();
  assert.throws(
    () => act(s, "start", { id: "second", team_id: "team-2" }),
    /진행 중/,
  );
  assert.throws(
    () => act(s, "move", { session_id: "session-1", version: 1, delta: 1 }),
    /변경/,
  );
  assert.throws(
    () => act(s, "move", { session_id: "session-1", version: 2, delta: -1 }),
    /첫 장/,
  );
});
test("PDF and settings frozen at session start; selecting team is not a command", () => {
  let s = start();
  s = act(s, "settings", { settings: { ...defaults, duration_seconds: 600 } });
  s = act(s, "submission", {
    team_id: "team-1",
    previous_id: "pdf-1",
    submission: { ...s.submissions[0], id: "replacement", pages: 20 },
  });
  assert.equal(s.sessions[0].settings.duration_seconds, 420);
  assert.equal(s.sessions[0].submission_id, "pdf-1");
  assert.equal(s.sessions[0].page_count, 6);
});
test("team, event and role separation", () => {
  const s = start();
  assert.equal(visible(s, "participant").teams.length, 1);
  assert.equal(visible(s, "participant").evaluations.length, 0);
  assert.throws(() =>
    reduce(s, { ...command(s, "move", {}), event_id: "other" }, "participant"),
  );
  assert.throws(() => act(s, "settings", { settings: defaults }, "judge"));
  let other = seed();
  other = act(other, "start", { id: "session-2", team_id: "team-2" });
  other = act(other, "ready", { session_id: "session-2", version: 1 });
  assert.throws(() =>
    act(
      other,
      "move",
      { session_id: "session-2", version: 2, delta: 1 },
      "participant",
    ),
  );
});
test("rubric frozen, review CAS and final read-only, reopen retains rubric", () => {
  let s = seed();
  s = act(
    s,
    "review",
    {
      team_id: "team-1",
      rubric_id: "rubric-1",
      version: 0,
      scores: { innovation: 23 },
      notes: "good",
      final: false,
    },
    "judge",
  );
  s = act(s, "rubric", {
    id: "rubric-2",
    items: [{ id: "new", name: "새 기준", description: "", max: 100 }],
  });
  assert.equal(s.evaluations[0].rubric_id, "rubric-1");
  assert.throws(
    () =>
      act(
        s,
        "review",
        {
          team_id: "team-1",
          rubric_id: "rubric-1",
          version: 0,
          scores: {},
          notes: "",
          final: false,
        },
        "judge",
      ),
    /다른 탭/,
  );
  s = act(
    s,
    "review",
    {
      team_id: "team-1",
      rubric_id: "rubric-1",
      version: 1,
      scores: { innovation: 23, feasibility: 25, impact: 20, delivery: 14 },
      notes: "피드백",
      final: true,
    },
    "judge",
  );
  assert.throws(
    () => act(s, "review", { team_id: "team-1", version: 2 }, "judge"),
    /최종/,
  );
  s = act(s, "reopen", { evaluation_id: s.evaluations[0].id });
  assert.equal(s.evaluations[0].rubric_id, "rubric-1");
  assert.equal(s.evaluations[0].status, "draft");
  assert.equal(s.evaluations[0].notes, "피드백");
});
test("score server-equivalent validation rejects missing, unknown and out-of-range values", () => {
  const r = seed().rubrics[0];
  assert.throws(() => validateScores({}, r, true));
  assert.throws(() => validateScores({ innovation: 31 }, r, false));
  assert.throws(() => validateScores({ unknown: 1 }, r, false));
  assert.throws(() => validateScores({ innovation: NaN }, r, false));
  validateScores({}, r, false);
});
test("normal, warning, zero and overtime formatting and configured colors", () => {
  assert.equal(timerView(61000, defaults).state, "normal");
  assert.equal(timerView(60000, defaults).color, "#FBBF24");
  assert.equal(timerView(0, defaults).text, "00:00");
  assert.equal(timerView(-1, defaults).text, "+00:01");
  assert.equal(timerView(-61000, defaults).text, "+01:01");
  assert.equal(
    timerView(-1000, { ...defaults, overtime_color: "#FFAAAA" }).color,
    "#FFAAAA",
  );
});
test("contrast and settings validation", () => {
  assert.ok(contrast("#A50034", "#FFFFFF") >= 4.5);
  assert.ok(contrast("#800028", "#FFFFFF") >= 4.5);
  assert.ok(contrast("#746B72", "#FFFFFF") >= 4.5);
  validateSettings(defaults);
  assert.throws(() =>
    validateSettings({ ...defaults, normal_color: "#111111" }),
  );
  assert.throws(() => validateSettings({ ...defaults, duration_seconds: 5 }));
  assert.throws(() => validateSettings({ ...defaults, warning_seconds: 421 }));
});
test("USB keyboard aliases and text-entry exclusion", () => {
  assert.equal(slideKey("ArrowRight", null), 1);
  assert.equal(slideKey("PageDown", null), 1);
  assert.equal(slideKey("ArrowLeft", null), -1);
  assert.equal(slideKey("PageUp", null), -1);
  assert.equal(slideKey("a", null), 0);
  assert.equal(
    slideKey("PageDown", { closest: () => ({}) } as unknown as EventTarget),
    0,
  );
});
