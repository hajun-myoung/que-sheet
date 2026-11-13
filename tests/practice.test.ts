import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../lib/demo";
import { prepareSession, transitionSession } from "../lib/presentation";
import { remainingMs } from "../lib/model";
test("rehearsal freezes its own PDF/settings, restores time and never mutates event state", () => {
  const event = seed(),
    original = structuredClone(event),
    team = event.teams[0];
  let s = prepareSession(
    team,
    event.submissions[0],
    event.event.settings,
    "practice-test",
  );
  s = transitionSession(
    s,
    "ready",
    { session_id: s.id, version: s.version },
    100000,
  );
  s = transitionSession(
    s,
    "move",
    { session_id: s.id, version: s.version, delta: 1 },
    110000,
  );
  s = JSON.parse(JSON.stringify(s));
  assert.equal(s.current_page, 2);
  assert.equal(remainingMs(s, 120000), 400000);
  s = transitionSession(
    s,
    "pause",
    { session_id: s.id, version: s.version },
    120000,
  );
  assert.equal(remainingMs(s, 999999), 400000);
  s = transitionSession(
    s,
    "resume",
    { session_id: s.id, version: s.version },
    140000,
  );
  assert.equal(remainingMs(s, 150000), 390000);
  assert.deepEqual(event, original);
  event.event.settings.duration_seconds = 600;
  assert.equal(s.settings.duration_seconds, 420);
  assert.throws(
    () =>
      transitionSession(s, "move", { session_id: s.id, version: 1, delta: 1 }),
    /변경/,
  );
  s = transitionSession(
    s,
    "end",
    { session_id: s.id, version: s.version },
    160000,
  );
  assert.throws(
    () =>
      transitionSession(s, "move", {
        session_id: s.id,
        version: s.version,
        delta: 1,
      }),
    /종료/,
  );
});
