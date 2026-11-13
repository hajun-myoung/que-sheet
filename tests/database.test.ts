import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { bootstrapSql, migrationSql } from "./fixtures";
import { PGlite } from "@electric-sql/pglite";
let db: PGlite;
const uid = (i: number) =>
  `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const op = uid(1),
  participant = uid(2),
  judge = uid(3),
  outsider = uid(4),
  otherParticipant = uid(5),
  event = uid(10),
  team = uid(20),
  otherTeam = uid(21),
  pdf = uid(30);
async function as(user: string) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false); select set_config('request.jwt.claims','{"email":"${user}@example.com"}',false);`,
  );
}
async function command(
  kind: string,
  p: Record<string, unknown>,
  request = crypto.randomUUID(),
  eid = event,
) {
  return (
    await db.query<{ result: unknown }>(
      "select public.app_command($1,$2,$3,$4::jsonb) result",
      [eid, request, kind, JSON.stringify(p)],
    )
  ).rows[0].result as Record<string, any>;
}
async function snapshot() {
  return (
    await db.query<{ data: any }>("select public.app_snapshot($1) data", [
      event,
    ])
  ).rows[0].data;
}
// Each failed statement is auto-rolled back; fixture creation is explicit.
before(async () => {
  db = new PGlite();
  await db.exec(bootstrapSql);
  await db.exec(migrationSql);
  await db.query("insert into auth.users(id) select unnest($1::uuid[])", [
    [op, participant, judge, outsider, otherParticipant],
  ]);
  await as(op);
  await db.query("select public.create_event($1,$2)", ["테스트 행사", event]);
  await command("team", {
    id: team,
    name: "첫 팀",
    description: "테스트",
    duration_seconds: null,
  });
  await command("team", {
    id: otherTeam,
    name: "둘째 팀",
    description: "테스트",
    duration_seconds: null,
  });
  await db.exec("reset role");
  await db.query(
    "insert into public.members values($1,$2,'participant',$3,'참여자'),($1,$4,'judge',null,'심사위원'),($1,$5,'participant',$6,'다른 팀')",
    [event, participant, team, judge, otherParticipant, otherTeam],
  );
  await db.query("insert into public.assignments values($1,$2,$3)", [
    event,
    team,
    judge,
  ]);
  await db.query(
    "select public.finalize_submission($1,$2,$3,null,$4,$5,$6,6,5000)",
    [op, event, team, pdf, "자료.pdf", `${event}/${team}/${pdf}.pdf`],
  );
  await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
    "presentations",
    `${event}/${team}/${pdf}.pdf`,
  ]);
});
after(async () => {
  await db?.close();
});
test("RLS hides unrelated teams, submissions, evaluations and private storage objects", async () => {
  await as(participant);
  assert.equal((await db.query("select * from public.teams")).rows.length, 1);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    1,
  );
  await as(otherParticipant);
  assert.equal(
    (await db.query("select * from public.submissions")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  await as(outsider);
  assert.equal((await db.query("select * from public.events")).rows.length, 0);
  assert.equal(
    (await db.query("select * from public.sessions")).rows.length,
    0,
  );
  await assert.rejects(() => snapshot(), /접근 권한/);
});
test("direct writes and privileged finalize are denied to authenticated users", async () => {
  await as(participant);
  await assert.rejects(
    () =>
      db.query("update public.teams set name=$1 where id=$2", ["침입", team]),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      db.query(
        "select public.finalize_submission($1,$2,$3,null,$4,$5,$6,6,5000)",
        [participant, event, team, crypto.randomUUID(), "h.pdf", "h.pdf"],
      ),
    /permission denied/,
  );
  await assert.rejects(
    () => command("settings", { settings: {} }),
    /운영자 권한/,
  );
  await as(outsider);
  await assert.rejects(
    () => command("team", { id: crypto.randomUUID(), name: "bad" }),
    /접근 권한/,
  );
});
test("start is atomic and idempotent; page movement preserves frozen timer; stale versions rejected", async () => {
  await as(op);
  const id = crypto.randomUUID(),
    rid = crypto.randomUUID();
  const started = await command("start", { id, team_id: team }, rid);
  const duplicate = await command("start", { id, team_id: team }, rid);
  assert.deepEqual(duplicate, started);
  await assert.rejects(
    () => command("start", { id: crypto.randomUUID(), team_id: team }),
    /진행 중/,
  );
  await assert.rejects(
    () => command("start", { id: "different", team_id: team }, rid),
    /요청 ID/,
  );
  const running = await command("ready", { session_id: id, version: 1 });
  await as(participant);
  const moveId = crypto.randomUUID();
  const moved = await command(
    "move",
    { session_id: id, version: 2, delta: 1 },
    moveId,
  );
  assert.equal(moved.current_page, 2);
  assert.equal(moved.started_at, running.started_at);
  assert.equal(moved.paused_ms, running.paused_ms);
  assert.deepEqual(
    await command("move", { session_id: id, version: 2, delta: 1 }, moveId),
    moved,
  );
  await assert.rejects(
    () => command("move", { session_id: id, version: 2, delta: 1 }),
    /변경/,
  );
  await assert.rejects(
    () => command("move", { session_id: id, version: 3, delta: 999 }),
    /페이지/,
  );
  await as(otherParticipant);
  await assert.rejects(
    () => command("move", { session_id: id, version: 3, delta: 1 }),
    /현재 발표 팀/,
  );
  await as(judge);
  await assert.rejects(
    () => command("move", { session_id: id, version: 3, delta: 1 }),
    /현재 발표 팀/,
  );
  await as(op);
  const paused = await command("pause", { session_id: id, version: 3 });
  assert.equal(paused.status, "paused");
  const resumed = await command("resume", { session_id: id, version: 4 });
  assert.ok(resumed.paused_ms >= 0);
  const reset = await command("reset", { session_id: id, version: 5 });
  assert.equal(reset.current_page, 2);
  await command("end", { session_id: id, version: 6 });
  await as(participant);
  await assert.rejects(
    () => command("move", { session_id: id, version: 7, delta: 1 }),
    /종료/,
  );
});
test("server settings enforce ranges and contrast", async () => {
  await as(op);
  for (const settings of [
    {},
    {
      duration_seconds: null,
      warning_seconds: null,
      normal_color: null,
      warning_color: null,
      overtime_color: null,
    },
    {
      duration_seconds: 5,
      warning_seconds: 60,
      normal_color: "#FFFFFF",
      warning_color: "#FBBF24",
      overtime_color: "#FB7185",
    },
    {
      duration_seconds: 420,
      warning_seconds: 60,
      normal_color: "#111111",
      warning_color: "#FBBF24",
      overtime_color: "#FB7185",
    },
  ])
    await assert.rejects(() => command("settings", { settings }));
});
test("rubric history, review bounds, CAS, final immutability and reopen", async () => {
  await as(judge);
  const state = await snapshot(),
    rid = state.event.current_rubric_id;
  await assert.rejects(
    () =>
      command("review", {
        team_id: otherTeam,
        rubric_id: rid,
        version: 0,
        scores: {},
        final: false,
      }),
    /배정/,
  );
  for (const scores of [{ innovation: 31 }, { innovation: null }, { alien: 5 }])
    await assert.rejects(() =>
      command("review", {
        team_id: team,
        rubric_id: rid,
        version: 0,
        scores,
        final: false,
      }),
    );
  await assert.rejects(
    () =>
      command("review", {
        team_id: team,
        rubric_id: rid,
        version: 0,
        scores: { innovation: 20 },
        final: true,
      }),
    /필수/,
  );
  const draft = await command("review", {
    team_id: team,
    rubric_id: rid,
    version: 0,
    scores: { innovation: 20 },
    notes: "초안",
    final: false,
  });
  await as(op);
  await command("rubric", {
    id: crypto.randomUUID(),
    items: [{ id: "new", name: "새 기준", description: "다른 의미", max: 50 }],
  });
  await as(judge);
  await assert.rejects(
    () =>
      command("review", {
        team_id: team,
        rubric_id: rid,
        version: 0,
        scores: {},
        notes: "덮어쓰기",
        final: false,
      }),
    /다른 탭/,
  );
  const payload = {
    team_id: team,
    rubric_id: rid,
    version: 1,
    scores: { innovation: 20, feasibility: 25, impact: 24, delivery: 13 },
    notes: "의견 보존",
    final: true,
  };
  const finalId = crypto.randomUUID();
  const final = await command("review", payload, finalId);
  assert.deepEqual(await command("review", payload, finalId), final);
  assert.equal(final.rubric_id, rid);
  await assert.rejects(
    () => command("review", { ...payload, version: 2 }),
    /최종 제출/,
  );
  await as(participant);
  assert.equal(
    (await db.query("select * from public.evaluations")).rows.length,
    0,
  );
  await as(op);
  await command("reopen", { evaluation_id: draft.id });
  const reopened = (await snapshot()).evaluations[0];
  assert.equal(reopened.rubric_id, rid);
  assert.equal(reopened.notes, "의견 보존");
  assert.equal(reopened.status, "draft");
});
test("submission swap is compare-and-set; prior session still references original PDF", async () => {
  await db.exec("reset role");
  const next = crypto.randomUUID();
  await db.query(
    "select public.finalize_submission($1,$2,$3,$4,$5,$6,$7,9,8000)",
    [
      participant,
      event,
      team,
      pdf,
      next,
      "새자료.pdf",
      `${event}/${team}/${next}.pdf`,
    ],
  );
  await assert.rejects(
    () =>
      db.query(
        "select public.finalize_submission($1,$2,$3,$4,$5,$6,$7,9,8000)",
        [
          participant,
          event,
          team,
          pdf,
          crypto.randomUUID(),
          "경합.pdf",
          `${event}/${team}/race.pdf`,
        ],
      ),
    /변경/,
  );
  await as(op);
  const s = await snapshot();
  assert.equal(s.teams.find((t: any) => t.id === team).submission_id, next);
  assert.equal(s.sessions[0].submission_id, pdf);
  assert.equal(s.submissions.length, 2);
});
test("cross-event roles do not confer access and invitations require verified matching email", async () => {
  await as(op);
  const invite = crypto.randomUUID();
  await command("invite", {
    id: invite,
    role: "judge",
    email: `${outsider}@example.com`,
    display_name: "새 심사위원",
  });
  await as(participant);
  await assert.rejects(
    () => db.query("select public.accept_invitation($1)", [invite]),
    /초대 이메일/,
  );
  await as(outsider);
  await db.query("select public.accept_invitation($1)", [invite]);
  assert.equal((await snapshot()).me.role, "judge");
  assert.equal((await db.query("select * from public.teams")).rows.length, 0);
  const otherEvent = crypto.randomUUID();
  await db.query("select public.create_event($1,$2)", [
    "다른 행사",
    otherEvent,
  ]);
  await as(participant);
  await assert.rejects(
    () =>
      command(
        "team",
        { id: crypto.randomUUID(), name: "접근 시도" },
        crypto.randomUUID(),
        otherEvent,
      ),
    /접근 권한/,
  );
});

test("participant codes are operator-issued, scoped, rotated, expiring and throttled", async () => {
  const newcomer = uid(6),
    anonymous = uid(7);
  await db.exec("reset role");
  await db.query(
    "insert into auth.users(id,email_confirmed_at) values($1,null),($2,null)",
    [newcomer, anonymous],
  );
  await as(participant);
  await assert.rejects(
    () =>
      db.query("select public.issue_participant_code($1,$2)", [event, team]),
    /운영자/,
  );
  await assert.rejects(
    () => db.query("select * from public.participant_codes"),
    /permission denied/,
  );
  await as(op);
  async function issue(t = team) {
    return (
      await db.query<{ r: { code: string } }>(
        "select public.issue_participant_code($1,$2) r",
        [event, t],
      )
    ).rows[0].r.code;
  }
  async function redeem(code: string) {
    return (
      await db.query<{ r: any }>(
        "select public.redeem_participant_code($1) r",
        [code],
      )
    ).rows[0].r;
  }
  const old = await issue(),
    code = await issue(),
    otherCode = await issue(otherTeam);
  await as(newcomer);
  assert.match((await redeem(old)).error, /올바르지/);
  assert.equal(
    (
      await redeem(
        code
          .toLowerCase()
          .match(/.{1,8}/g)!
          .join("-"),
      )
    ).team_id,
    team,
  );
  assert.equal((await snapshot()).me.role, "participant");
  assert.equal((await snapshot()).teams.length, 1);
  assert.match((await redeem(otherCode)).error, /다른 역할이나 팀/);
  await assert.rejects(
    () => db.query("select public.create_event($1,$2)", ["권한 상승", uid(99)]),
    /이메일 인증/,
  );
  await assert.rejects(
    () =>
      db.query("select public.create_event_verified($1,$2)", ["우회", uid(99)]),
    /permission denied/,
  );
  await as(op);
  assert.match((await redeem(code)).error, /다른 역할/);
  await db.exec("reset role");
  await db.query(
    "update public.participant_codes set expires_at=now()-interval '1 second' where team_id=$1",
    [team],
  );
  await as(anonymous);
  assert.match((await redeem(code)).error, /올바르지/);
  for (let i = 0; i < 9; i++)
    assert.match((await redeem("invalid")).error, /올바르지/);
  assert.match((await redeem(otherCode)).error, /시도 횟수/);
  await assert.rejects(
    () => db.query("select * from public.code_attempts"),
    /permission denied/,
  );
  // Rotation does not silently revoke a previously granted team membership.
  await as(newcomer);
  assert.equal((await snapshot()).me.team_id, team);
});

test("survey profile and PDF commit atomically, with idempotency and ownership checks", async () => {
  const profile = {
    name: "설문 팀",
    leader_name: "팀장",
    member_names: ["팀원 A", "팀원 B"],
  };
  const id = uid(50),
    next = uid(51);
  async function submit(
    actor: string,
    previous: string | null,
    fileId: string,
    p: unknown,
  ) {
    return db.query(
      "select public.finalize_submission_with_profile($1,$2,$3,$4,$5,$6,$7,6,5000,$8::jsonb)",
      [
        actor,
        event,
        otherTeam,
        previous,
        fileId,
        "설문.pdf",
        `${event}/${otherTeam}/${fileId}.pdf`,
        JSON.stringify(p),
      ],
    );
  }
  await as(otherParticipant);
  await assert.rejects(
    () => submit(otherParticipant, null, id, profile),
    /permission denied/,
  );
  await db.exec("reset role; set role service_role");
  await assert.rejects(() => submit(participant, null, id, profile));
  await assert.rejects(() =>
    submit(otherParticipant, null, id, { ...profile, leader_name: "" }),
  );
  await submit(otherParticipant, null, id, profile);
  await submit(otherParticipant, null, id, profile);
  await assert.rejects(
    () => submit(otherParticipant, null, id, { ...profile, name: "다른 내용" }),
    /다릅니다/,
  );
  await assert.rejects(
    () => submit(otherParticipant, null, next, { ...profile, name: "충돌" }),
    /변경/,
  );
  await as(op);
  let t = (await snapshot()).teams.find((t: any) => t.id === otherTeam);
  assert.equal(t.name, profile.name);
  assert.equal(t.leader_name, profile.leader_name);
  assert.deepEqual(t.member_names, profile.member_names);
  assert.equal(t.submission_id, id);
  await db.exec("reset role; set role service_role");
  await submit(otherParticipant, id, next, { ...profile, name: "최신 팀" });
  await submit(otherParticipant, null, id, profile);
  await as(op);
  t = (await snapshot()).teams.find((t: any) => t.id === otherTeam);
  assert.equal(t.name, "최신 팀");
  assert.equal(t.submission_id, next);
});
