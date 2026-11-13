import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { bootstrapSql, migrationSql } from "./fixtures";
import { invitationMail } from "../supabase/functions/send-invitations/template";
let db: PGlite;
const op = crypto.randomUUID(),
  other = crypto.randomUUID();
async function as(user: string) {
  await db.exec("reset role;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
}
async function service() {
  await db.exec("reset role;set role service_role");
}
async function rpc(name: string, args: unknown[]) {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(",");
  return (
    await db.query<{ r: any }>(`select public.${name}(${placeholders}) r`, args)
  ).rows[0].r;
}
async function setup() {
  await as(op);
  const event = crypto.randomUUID(),
    team = crypto.randomUUID();
  await rpc("create_event", ["행사 삭제 검증", event]);
  await rpc("app_command", [
    event,
    crypto.randomUUID(),
    "team",
    JSON.stringify({
      id: team,
      name: "초대 팀",
      description: "",
      duration_seconds: null,
    }),
  ]);
  return { event, team };
}
async function register(
  event: string,
  team: string,
  email = "member@example.com",
) {
  const id = crypto.randomUUID();
  await as(op);
  await rpc("app_command", [
    event,
    crypto.randomUUID(),
    "invite",
    JSON.stringify({
      id,
      email,
      display_name: "멤버",
      role: "participant",
      team_id: team,
      registered_only: true,
    }),
  ]);
  return id;
}
before(async () => {
  db = new PGlite();
  await db.exec(bootstrapSql);
  await db.exec(migrationSql);
  await db.query("insert into auth.users(id) values($1),($2)", [op, other]);
});
after(async () => {
  await db.close();
});
test("member registration is operator-only, idempotent, and grants no membership", async () => {
  const { event, team } = await setup();
  const id = crypto.randomUUID(),
    request = crypto.randomUUID();
  const payload = JSON.stringify({
    id,
    email: "member@example.com",
    display_name: "등록 멤버",
    role: "participant",
    team_id: team,
    registered_only: true,
  });
  await as(other);
  await assert.rejects(rpc("app_command", [event, request, "invite", payload]));
  await as(op);
  await rpc("app_command", [event, request, "invite", payload]);
  await rpc("app_command", [event, request, "invite", payload]);
  assert.equal(
    (
      await db.query("select * from public.invitations where event_id=$1", [
        event,
      ])
    ).rows.length,
    1,
  );
  assert.equal(
    (await db.query("select * from public.members where event_id=$1", [event]))
      .rows.length,
    1,
  );
  await assert.rejects(
    rpc("claim_invitation_email", [op, event, id, crypto.randomUUID()]),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select mail_code from public.participant_codes"),
    /permission denied/,
  );
});
test("mail claims prevent duplicates, preserve a team code, and isolate uncertain outcomes", async () => {
  const { event, team } = await setup();
  const id = await register(event, team),
    id2 = await register(event, team, "second@example.com");
  await as(op);
  const issued = await rpc("issue_participant_code", [event, team]);
  await service();
  await assert.rejects(
    rpc("claim_invitation_email", [other, event, id, crypto.randomUUID()]),
  );
  const attempt = crypto.randomUUID();
  const first = await rpc("claim_invitation_email", [op, event, id, attempt]);
  assert.equal(first.status, "claimed");
  assert.equal(first.code, issued.code);
  assert.equal(
    (await rpc("claim_invitation_email", [op, event, id, crypto.randomUUID()]))
      .status,
    "sending",
  );
  await as(op);
  await assert.rejects(rpc("issue_participant_code", [event, team]), /발송 중/);
  await service();
  const second = await rpc("claim_invitation_email", [
    op,
    event,
    id2,
    crypto.randomUUID(),
  ]);
  assert.equal(second.code, first.code);
  await rpc("finish_invitation_email", [id, attempt, "sent", null]);
  assert.equal(
    (await rpc("claim_invitation_email", [op, event, id, crypto.randomUUID()]))
      .status,
    "sent",
  );
  await assert.rejects(
    rpc("finish_invitation_email", [id, crypto.randomUUID(), "failed", null]),
  );
  await db.exec("reset role");
  await db.query(
    "update public.invitations set mail_started_at=now()-interval '3 minutes' where id=$1",
    [id2],
  );
  await service();
  assert.equal(
    (await rpc("claim_invitation_email", [op, event, id2, crypto.randomUUID()]))
      .status,
    "unknown",
  );
  assert.equal(
    (await rpc("claim_invitation_email", [op, event, id2, crypto.randomUUID()]))
      .status,
    "unknown",
  );
  await as(other);
  await assert.rejects(rpc("retry_unknown_email", [event, id2]));
  await as(op);
  await rpc("retry_unknown_email", [event, id2]);
  await service();
  assert.equal(
    (await rpc("claim_invitation_email", [op, event, id2, crypto.randomUUID()]))
      .status,
    "claimed",
  );
});
test("event deletion enforces role/name/active-session checks and retains retriable cleanup receipt", async () => {
  const { event, team } = await setup();
  const pdf = crypto.randomUUID(),
    session = crypto.randomUUID();
  await db.exec("reset role");
  await rpc("finalize_submission", [
    op,
    event,
    team,
    null,
    pdf,
    "test.pdf",
    `${event}/${team}/${pdf}.pdf`,
    2,
    100,
  ]);
  await db.query(
    "insert into storage.objects(bucket_id,name) values('presentations',$1),('presentations',$2)",
    [`${event}/${team}/${pdf}.pdf`, "other-event/file.pdf"],
  );
  await as(op);
  await rpc("app_command", [
    event,
    crypto.randomUUID(),
    "start",
    JSON.stringify({ id: session, team_id: team }),
  ]);
  await assert.rejects(
    rpc("begin_event_deletion", [op, event, "행사 삭제 검증"]),
    /permission denied/,
  );
  await service();
  await assert.rejects(
    rpc("begin_event_deletion", [other, event, "행사 삭제 검증"]),
    /운영자/,
  );
  await assert.rejects(
    rpc("begin_event_deletion", [op, event, "틀린 이름"]),
    /이름/,
  );
  await assert.rejects(
    rpc("begin_event_deletion", [op, event, "행사 삭제 검증"]),
    /발표/,
  );
  await as(op);
  await rpc("app_command", [
    event,
    crypto.randomUUID(),
    "end",
    JSON.stringify({ session_id: session, version: 1 }),
  ]);
  await service();
  const receipt = await rpc("begin_event_deletion", [
    op,
    event,
    "행사 삭제 검증",
  ]);
  assert.deepEqual(receipt.paths, [`${event}/${team}/${pdf}.pdf`]);
  assert.deepEqual(
    await rpc("begin_event_deletion", [op, event, "행사 삭제 검증"]),
    receipt,
  );
  await as(op);
  assert.equal(
    (await db.query("select * from public.events where id=$1", [event])).rows
      .length,
    0,
  );
  assert.ok(
    (await rpc("pending_event_deletions", [])).some((e: any) => e.id === event),
  );
  await assert.rejects(
    rpc("create_event", ["행사 삭제 검증", event]),
    /재사용/,
  );
  await as(other);
  assert.deepEqual(await rpc("pending_event_deletions", []), []);
  await service();
  await rpc("finish_event_deletion", [op, event]);
  await as(op);
  assert.deepEqual(await rpc("pending_event_deletions", []), []);
  await db.exec("reset role");
  assert.equal(
    (await db.query<{ n: number }>("select count(*) n from auth.users")).rows[0]
      .n,
    2,
  );
});
test("invitation templates escape user content and separate role-specific access links", () => {
  const base = {
    id: crypto.randomUUID(),
    email: "member@example.com",
    display_name: "<img src=x>",
    event_name: "<script>bad</script>",
    team_name: "A&B",
    code: "ABCD1234EFGH5678",
    expires_at: "2026-11-20T00:00:00Z",
  };
  const participant = invitationMail(
    { ...base, role: "participant" },
    "https://cue.example.com",
  );
  assert.match(participant.html, /&lt;img/);
  assert.doesNotMatch(participant.html, /<script>|<img/);
  assert.match(participant.text, /#code=ABCD1234EFGH5678/);
  assert.match(participant.text, /ABCD1234-EFGH5678/);
  const staff = invitationMail(
    { ...base, role: "judge" },
    "https://cue.example.com",
  );
  assert.match(staff.text, /role=judge&invite=/);
  assert.doesNotMatch(staff.text, /#code=|참여 코드:/);
  assert.throws(() =>
    invitationMail({ ...base, role: "judge" }, "javascript:alert(1)"),
  );
});
