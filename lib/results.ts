import type { Snapshot } from "./model";

/** Only final, assigned evaluations contribute; rubric versions stay separate. */
export function groupTeamResults(data: Snapshot) {
  return [...data.teams]
    .sort((a, b) => a.sort_index - b.sort_index)
    .map((team) => {
      const reviews = data.assignments
        .filter((a) => a.team_id === team.id)
        .map((assignment) => {
          const evaluation = data.evaluations.find(
            (e) => e.team_id === team.id && e.judge_id === assignment.judge_id,
          );
          return {
            judgeId: assignment.judge_id,
            judge: data.members.find((m) => m.user_id === assignment.judge_id),
            evaluation,
            rubric: data.rubrics.find((r) => r.id === evaluation?.rubric_id),
          };
        });
      const submitted = reviews.filter(
        (r) => r.evaluation?.status === "submitted",
      );
      const averages = data.rubrics
        .filter((r) => submitted.some((review) => review.rubric?.id === r.id))
        .sort((a, b) => a.version - b.version)
        .map((rubric) => {
          const entries = submitted.filter((r) => r.rubric?.id === rubric.id);
          return {
            rubric,
            count: entries.length,
            score:
              entries.reduce(
                (total, r) =>
                  total +
                  Object.values(r.evaluation!.scores).reduce(
                    (a, b) => a + b,
                    0,
                  ),
                0,
              ) / entries.length,
            max: rubric.items.reduce((total, item) => total + item.max, 0),
          };
        });
      return { team, reviews, submittedCount: submitted.length, averages };
    });
}

export function formatResultScore(score: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(
    score,
  );
}
