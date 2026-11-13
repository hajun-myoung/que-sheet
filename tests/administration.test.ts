import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { bootstrapSql, migrationSql } from "./fixtures";
let db: PGlite;
const op = crypto.randomUUID(),
  other = crypto.randomUUID(),
  judge = crypto.randomUUID();
async function as(id: string) {
  await db.exec("reset role; set role authenticated");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [id, JSON.stringify({ email: `${id}@example.com` })],
  );
}
async function command(
  event: string,
  kind: string,
  p: unknown,
  request = crypto.randomUUID(),
) {
  return db.query("select public.app_command($1,$2,$3,$4::jsonb)", [
    event,
    request,
    kind,
    JSON.stringify(p),
  ]);
}
async function setup() {
  await as(op);
  const event = crypto.randomUUID();
  await db.query("select public.create_event('원래 행사',$1)", [event]);
  return event;
}
before(async () => {
  db = new PGlite();
  await db.exec(bootstrapSql);
  await db.exec(migrationSql);
  await db.query("insert into auth.users(id) values($1),($2),($3)", [
    op,
    other,
    judge,
  ]);
});
after(async () => {
  await db.close();
});
test("event rename validates input, rejects stale edits, and deduplicates requests", async () => {
  const event = await setup(),
    request = crypto.randomUUID();
  const p = { name: "새 행사", expected_name: "원래 행사" };
  await command(event, "event_rename", p, request);
  await command(event, "event_rename", p, request);
  await assert.rejects(
    command(event, "event_rename", {
      name: "덮어쓰기",
      expected_name: "원래 행사",
    }),
    /다른 운영자/,
  );
  for (const name of ["", "  ", "x".repeat(101), null, 123])
    await assert.rejects(
      command(event, "event_rename", { name, expected_name: "새 행사" }),
    );
  const row = (
    await db.query<{ name: string }>(
      "select name from public.events where id=$1",
      [event],
    )
  ).rows[0];
  assert.equal(row.name, "새 행사");
});
test("outsiders and judges cannot administer events or directly change memberships", async () => {
  const event = await setup();
  await db.exec("reset role");
  await db.query(
    "insert into public.members values($1,$2,'judge',null,'심사위원')",
    [event, judge],
  );
  for (const actor of [other, judge]) {
    await as(actor);
    for (const [kind, p] of [
      ["event_rename", { name: "침입", expected_name: "원래 행사" }],
      [
        "operator_update",
        {
          user_id: op,
          display_name: "침입",
          expected_name: `${op}@example.com`,
        },
      ],
      ["operator_remove", { user_id: op }],
      ["operator_invitation_cancel", { invitation_id: crypto.randomUUID() }],
    ] as const)
      await assert.rejects(command(event, kind, p));
    await assert.rejects(
      db.query("update public.members set role='operator' where event_id=$1", [
        event,
      ]),
      /permission denied/,
    );
  }
});
test("operator invitation acceptance, rename, removal and last-operator protection", async () => {
  const event = await setup(),
    inv = crypto.randomUUID();
  await command(event, "invite", {
    id: inv,
    role: "operator",
    display_name: "공동 운영자",
    email: `${other}@example.com`,
  });
  await as(other);
  await db.query("select public.accept_invitation($1)", [inv]);
  await db.query("select public.accept_invitation($1)", [inv]);
  await as(op);
  await command(event, "operator_update", {
    user_id: other,
    display_name: "새 이름",
    expected_name: "공동 운영자",
  });
  await assert.rejects(
    command(event, "operator_update", {
      user_id: other,
      display_name: "충돌",
      expected_name: "공동 운영자",
    }),
    /다른 운영자/,
  );
  await command(event, "operator_remove", { user_id: other });
  await assert.rejects(
    command(event, "operator_remove", { user_id: op }),
    /마지막 운영자/,
  );
  await as(other);
  await assert.rejects(
    command(event, "event_rename", {
      name: "거부",
      expected_name: "원래 행사",
    }),
  );
  await assert.rejects(
    db.query("select public.accept_invitation($1)", [inv]),
    /사용된 초대/,
  );
  assert.equal(
    (await db.query("select * from public.events where id=$1", [event])).rows
      .length,
    0,
  );
});
test("canceled invitations cannot be accepted and other-event targets cannot be modified", async () => {
  const event = await setup(),
    otherEvent = await setup(),
    inv = crypto.randomUUID();
  await command(otherEvent, "invite", {
    id: inv,
    role: "operator",
    display_name: "대기 운영자",
    email: `${other}@example.com`,
  });
  await assert.rejects(
    command(event, "operator_invitation_cancel", { invitation_id: inv }),
    /대기 중/,
  );
  const rid = crypto.randomUUID();
  await command(
    otherEvent,
    "operator_invitation_cancel",
    { invitation_id: inv },
    rid,
  );
  await command(
    otherEvent,
    "operator_invitation_cancel",
    { invitation_id: inv },
    rid,
  );
  await as(other);
  await assert.rejects(
    db.query("select public.accept_invitation($1)", [inv]),
    /취소/,
  );
  await as(op);
  await assert.rejects(
    command(event, "operator_update", {
      user_id: other,
      display_name: "침입",
      expected_name: "대기 운영자",
    }),
    /이 행사/,
  );
});
test("in-flight invitation mail cannot be canceled", async () => {
  const event = await setup(),
    inv = crypto.randomUUID();
  await command(event, "invite", {
    id: inv,
    role: "operator",
    display_name: "발송 운영자",
    email: `${other}@example.com`,
    registered_only: true,
  });
  await db.exec("reset role");
  await db.query("select public.claim_invitation_email($1,$2,$3,$4)", [
    op,
    event,
    inv,
    crypto.randomUUID(),
  ]);
  await as(op);
  await assert.rejects(
    command(event, "operator_invitation_cancel", { invitation_id: inv }),
    /메일 발송/,
  );
});
