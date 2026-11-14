import type { Role, Snapshot } from "./model";
import { seed } from "./demo";

export const testAccounts = [
  {
    role: "participant",
    credential: "TRYTEAM1",
    team_id: "team-1",
    user_id: "participant",
    name: "루미너스 · 제출 완료",
  },
  {
    role: "participant",
    credential: "TRYTEAM2",
    team_id: "team-2",
    user_id: "participant-2",
    name: "그린루프 · 제출 완료",
  },
  {
    role: "participant",
    credential: "TRYTEAM3",
    team_id: "team-3",
    user_id: "participant-3",
    name: "모먼트 · 첫 제출",
  },
  {
    role: "operator",
    credential: "operator@demo.cuesheet.example",
    user_id: "operator",
    name: "테스트 운영자",
  },
  {
    role: "judge",
    credential: "judge1@demo.cuesheet.example",
    user_id: "judge",
    name: "테스트 심사위원 1",
  },
  {
    role: "judge",
    credential: "judge2@demo.cuesheet.example",
    user_id: "judge-2",
    name: "테스트 심사위원 2",
  },
] as const;

export function testAccount(role: Role, credential: string) {
  return testAccounts.find(
    (a) =>
      a.role === role &&
      a.credential.toLowerCase() === credential.trim().toLowerCase(),
  );
}

// The mode is chosen before creating the backend client. A test tab never creates it.
export const testMode =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("demo") === "1";
export const homeHref = testMode ? "/?demo=1" : "/";

export function enterTestWorkspace(role: Role, credential: string) {
  const account = testAccount(role, credential);
  if (!account)
    throw Error("안내에 있는 테스트 코드 또는 이메일을 입력해 주세요.");
  sessionStorage.removeItem("cue-test-access");
  sessionStorage.setItem(
    "cue-test-pending",
    JSON.stringify({ role, credential }),
  );
  window.location.assign("/?demo=1");
}

export function seedTestWorkspace(): Snapshot {
  const state = seed();
  state.event.name = "큐:시트 테스트 워크스페이스";
  state.event.subtitle = "3팀과 함께 발표 진행과 심사를 연습하세요";
  state.teams = state.teams.slice(0, 3);
  state.teams[2].submission_id = null;
  state.submissions = state.submissions.slice(0, 2);
  state.members = testAccounts.map((a) => ({
    user_id: a.user_id,
    event_id: state.event.id,
    role: a.role,
    team_id: "team_id" in a ? a.team_id : null,
    display_name: a.name.split(" · ")[0],
  }));
  state.assignments = ["judge", "judge-2"].flatMap((judge_id) =>
    state.teams.map((t) => ({
      event_id: state.event.id,
      team_id: t.id,
      judge_id,
    })),
  );
  return state;
}
