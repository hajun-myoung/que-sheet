import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { bootstrapSql } from "./fixtures";
// Use an empty disposable database named cue_test_* only.
const connectionString = process.env.CUE_TEST_DATABASE_URL;
test(
  "real PostgreSQL: simultaneous start, duplicate commands and review CAS",
  { skip: !connectionString },
  async () => {
    const url = new URL(connectionString!);
    assert.match(
      url.pathname,
      /^\/cue_test_[a-z0-9_]+$/,
      "Use a dedicated empty cue_test_* database",
    );
    const admin = new Client({ connectionString });
    await admin.connect();
    const clients: Client[] = [];
    try {
      // Roles are cluster-level; the disposable local cluster already has no application roles.
      await admin.query(bootstrapSql);
      await admin.query(
        readFileSync("supabase/migrations/202611120001_core.sql", "utf8"),
      );
      const operator = crypto.randomUUID(),
        judge = crypto.randomUUID(),
        event = crypto.randomUUID(),
        team = crypto.randomUUID(),
        pdf = crypto.randomUUID();
      await admin.query("insert into auth.users(id) values($1),($2)", [
        operator,
        judge,
      ]);
      async function actor(user: string) {
        const c = new Client({ connectionString });
        await c.connect();
        clients.push(c);
        await c.query("set role authenticated");
        await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
          user,
        ]);
        return c;
      }
      const a = await actor(operator),
        b = await actor(operator);
      const command = (
        c: Client,
        kind: string,
        p: unknown,
        id = crypto.randomUUID(),
      ) =>
        c
          .query("select public.app_command($1,$2,$3,$4::jsonb) result", [
            event,
            id,
            kind,
            JSON.stringify(p),
          ])
          .then((x) => x.rows[0].result);
      await a.query("select public.create_event($1,$2)", [
        "동시성 검증",
        event,
      ]);
      await command(a, "team", {
        id: team,
        name: "동시 팀",
        description: "",
        duration_seconds: null,
      });
      await admin.query(
        "select public.finalize_submission($1,$2,$3,null,$4,$5,$6,6,1000)",
        [operator, event, team, pdf, "test.pdf", `${event}/${team}/${pdf}.pdf`],
      );
      const starts = await Promise.allSettled([
        command(a, "start", { id: crypto.randomUUID(), team_id: team }),
        command(b, "start", { id: crypto.randomUUID(), team_id: team }),
      ]);
      assert.equal(starts.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal(starts.filter((x) => x.status === "rejected").length, 1);
      const session = (
        starts.find(
          (x) => x.status === "fulfilled",
        ) as PromiseFulfilledResult<any>
      ).value;
      await command(a, "ready", { session_id: session.id, version: 1 });
      const moveId = crypto.randomUUID(),
        payload = { session_id: session.id, version: 2, delta: 1 };
      const duplicate = await Promise.all([
        command(a, "move", payload, moveId),
        command(b, "move", payload, moveId),
      ]);
      assert.deepEqual(duplicate[0], duplicate[1]);
      assert.equal(duplicate[0].current_page, 2);
      const race = await Promise.allSettled([
        command(a, "move", { session_id: session.id, version: 3, delta: 1 }),
        command(b, "move", { session_id: session.id, version: 3, delta: 1 }),
      ]);
      assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal(
        (
          await admin.query(
            "select current_page from public.sessions where id=$1",
            [session.id],
          )
        ).rows[0].current_page,
        3,
      );
      await admin.query(
        "insert into public.members values($1,$2,'judge',null,'심사위원')",
        [event, judge],
      );
      await admin.query("insert into public.assignments values($1,$2,$3)", [
        event,
        team,
        judge,
      ]);
      const j1 = await actor(judge),
        j2 = await actor(judge);
      const rubric = (
        await admin.query(
          "select current_rubric_id from public.events where id=$1",
          [event],
        )
      ).rows[0].current_rubric_id;
      const review = {
        team_id: team,
        rubric_id: rubric,
        version: 0,
        scores: { innovation: 25 },
        notes: "",
        final: false,
      };
      const reviews = await Promise.allSettled([
        command(j1, "review", review),
        command(j2, "review", { ...review, notes: "다른 탭" }),
      ]);
      assert.equal(reviews.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal(reviews.filter((x) => x.status === "rejected").length, 1);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
      await admin.end();
    }
  },
);
