import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../lib/demo";
import { groupTeamResults, formatResultScore } from "../lib/results";
import type { Snapshot } from "../lib/model";

function review(
  data: Snapshot,
  judge: string,
  score: number,
  status: "submitted" | "draft" = "submitted",
  rubric = data.rubrics[0].id,
) {
  const team = data.teams[0].id;
  if (!data.assignments.some((a) => a.team_id === team && a.judge_id === judge))
    data.assignments.push({
      event_id: data.event.id,
      team_id: team,
      judge_id: judge,
    });
  data.evaluations.push({
    id: judge,
    event_id: data.event.id,
    team_id: team,
    judge_id: judge,
    rubric_id: rubric,
    scores: { innovation: score },
    notes: "",
    status,
    version: 1,
    updated_at: new Date(0).toISOString(),
  });
}
test("teams follow presentation order and one assigned judge stays a single detail", () => {
  const data = seed();
  const original = data.teams[0].id;
  review(data, "judge", 20);
  data.teams.reverse();
  const groups = groupTeamResults(data);
  assert.equal(groups[0].team.id, original);
  assert.equal(groups[0].reviews.length, 1);
  assert.equal(groups[0].reviews[0].evaluation?.scores.innovation, 20);
  assert.equal(data.teams.at(-1)?.id, original); // Sorting must not mutate the snapshot.
});
test("averages include zero but exclude drafts, missing scores, and unassigned evaluations", () => {
  const data = seed();
  review(data, "judge", 0);
  review(data, "second", 25);
  review(data, "draft", 30, "draft");
  data.assignments.push({
    event_id: data.event.id,
    team_id: data.teams[0].id,
    judge_id: "missing",
  });
  review(data, "removed", 100);
  data.assignments = data.assignments.filter((a) => a.judge_id !== "removed");
  const group = groupTeamResults(data)[0];
  assert.equal(group.reviews.length, 4);
  assert.equal(group.submittedCount, 2);
  assert.equal(group.averages[0].score, 12.5);
  assert.equal(group.averages[0].count, 2);
});
test("different rubric versions never share an average, even with equal maxima", () => {
  const data = seed();
  data.rubrics.push({ ...data.rubrics[0], id: "rubric-v2", version: 2 });
  review(data, "judge", 10);
  review(data, "second", 30);
  review(data, "third", 5, "submitted", "rubric-v2");
  const averages = groupTeamResults(data)[0].averages;
  assert.deepEqual(
    averages.map((a) => [a.rubric.version, a.score, a.count]),
    [
      [1, 20, 2],
      [2, 5, 1],
    ],
  );
});
test("unassigned teams and teams without final scores do not display a zero average", () => {
  const data = seed();
  data.assignments = [];
  let groups = groupTeamResults(data);
  assert.equal(groups.length, data.teams.length);
  assert.equal(groups[0].reviews.length, 0);
  assert.deepEqual(groups[0].averages, []);
  review(data, "judge", 20, "draft");
  groups = groupTeamResults(data);
  assert.deepEqual(groups[0].averages, []);
});
test("reopening a score removes it from the average and fractional scores format clearly", () => {
  const data = seed();
  review(data, "judge", 10);
  review(data, "second", 20);
  review(data, "third", 20);
  assert.equal(
    formatResultScore(groupTeamResults(data)[0].averages[0].score),
    "16.67",
  );
  data.evaluations[0].status = "draft";
  assert.equal(groupTeamResults(data)[0].averages[0].score, 20);
  assert.equal(formatResultScore(0), "0");
  assert.equal(formatResultScore(12.5), "12.5");
});
