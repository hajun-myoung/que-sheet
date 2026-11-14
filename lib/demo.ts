import { prepareSession, transitionSession } from "./presentation";
import {
  activeSession,
  validateTeamProfile,
  type TeamProfile,
  defaults,
  validateScores,
  validateSettings,
  uuid,
  type Command,
  type Snapshot,
  type Role,
  type Session,
  type Submission,
} from "./model";
const eid = "00000000-0000-4000-8000-000000000001";
export const demoUsers = {
  operator: "operator",
  participant: "participant",
  judge: "judge",
};
export function seed(): Snapshot {
  const teams = [
    "루미너스",
    "그린루프",
    "모먼트",
    "커넥트",
    "넥스트웨이브",
    "오브",
  ].map((name, i) => ({
    id: `team-${i + 1}`,
    event_id: eid,
    name,
    description: [
      "일상에 새로운 빛을 더하는 AI 라이프 플랫폼",
      "순환하는 일상, 지속 가능한 내일",
      "작은 순간을 연결하는 기록 서비스",
      "지역과 사람을 잇는 새로운 연결",
      "다음 세대를 위한 금융 경험",
      "취향이 모이는 라이프스타일 커뮤니티",
    ][i],
    sort_index: i,
    duration_seconds: i === 1 ? 600 : null,
    submission_id: i < 4 ? `pdf-${i + 1}` : null,
  }));
  const rubric = {
    id: "rubric-1",
    event_id: eid,
    version: 1,
    items: [
      {
        id: "innovation",
        name: "혁신성",
        description: "문제 해결 방식의 참신함과 차별성",
        max: 30,
      },
      {
        id: "feasibility",
        name: "실현 가능성",
        description: "구현 계획과 기술적 완성도",
        max: 30,
      },
      {
        id: "impact",
        name: "사업성",
        description: "시장 이해도와 지속 가능한 성장 가능성",
        max: 25,
      },
      {
        id: "delivery",
        name: "전달력",
        description: "발표의 명확성과 질의응답",
        max: 15,
      },
    ],
  };
  const me = {
    user_id: "operator",
    event_id: eid,
    role: "operator" as const,
    team_id: null,
    display_name: "김운영",
  };
  return {
    event: {
      id: eid,
      name: "2026 임팩트 데모데이",
      subtitle: "새로운 가능성을 만나는 시간",
      settings: { ...defaults },
      current_rubric_id: rubric.id,
    },
    me,
    teams,
    submissions: teams.slice(0, 4).map((t, i) => ({
      id: t.submission_id!,
      event_id: eid,
      team_id: t.id,
      name: `${t.name}_발표자료.pdf`,
      path: "/sample.pdf",
      pages: 6,
      bytes: 58320 + i * 1840,
      created_at: "2026-11-12T01:30:00Z",
    })),
    sessions: [],
    rubrics: [rubric],
    evaluations: [],
    members: [
      me,
      {
        user_id: "participant",
        event_id: eid,
        role: "participant",
        team_id: "team-1",
        display_name: "이참여",
      },
      {
        user_id: "judge",
        event_id: eid,
        role: "judge",
        team_id: null,
        display_name: "박심사",
      },
    ],
    assignments: teams.map((t) => ({
      event_id: eid,
      team_id: t.id,
      judge_id: "judge",
    })),
    invitations: [],
    server_time: new Date().toISOString(),
  };
}
export function visible(
  state: Snapshot,
  role: Role,
  participantTeam?: string,
  userId = demoUsers[role],
): Snapshot {
  const original = state.members.find((x) => x.user_id === userId)!;
  const me =
    role === "participant" && participantTeam
      ? { ...original, team_id: participantTeam }
      : original;
  const teams = state.teams.filter(
    (t) =>
      role === "operator" ||
      (role === "participant"
        ? t.id === me.team_id
        : state.assignments.some(
            (a) => a.team_id === t.id && a.judge_id === me.user_id,
          )),
  );
  const allowed = new Set(teams.map((t) => t.id));
  return {
    ...state,
    me,
    teams,
    submissions: state.submissions.filter((x) => allowed.has(x.team_id)),
    sessions: state.sessions.filter((x) => allowed.has(x.team_id)),
    evaluations: state.evaluations.filter(
      (x) => role === "operator" || x.judge_id === me.user_id,
    ),
    members: role === "operator" ? state.members : [me],
    invitations: role === "operator" ? state.invitations : [],
    server_time: new Date().toISOString(),
  };
}
function check(
  ok: unknown,
  msg = "권한이 없거나 상태가 변경되었습니다.",
): asserts ok {
  if (!ok) throw Error(msg);
}
export function reduce(
  state: Snapshot,
  cmd: Command,
  role: Role,
  now = Date.now(),
  participantTeam?: string,
  userId = demoUsers[role],
): Snapshot {
  const s = structuredClone(state),
    p = cmd.payload,
    original = s.members.find((x) => x.user_id === userId)!,
    me =
      role === "participant" && participantTeam
        ? { ...original, team_id: participantTeam }
        : original;
  const stamp = new Date(now).toISOString();
  check(cmd.event_id === s.event.id);
  const operator = () => check(role === "operator");
  const team = () => {
    const t = s.teams.find((x) => x.id === p.team_id);
    check(t, "팀을 찾을 수 없습니다.");
    return t;
  };
  const session = () => {
    const x = s.sessions.find((x) => x.id === p.session_id);
    check(x && x.status !== "ended", "종료되었거나 없는 세션입니다.");
    check(
      x.version === p.version,
      "상태가 변경되었습니다. 동기화 후 다시 시도해 주세요.",
    );
    return x;
  };
  switch (cmd.kind) {
    case "event_rename": {
      operator();
      check(
        typeof p.name === "string" &&
          p.name.trim().length >= 1 &&
          p.name.trim().length <= 100,
        "행사 이름은 1~100자로 입력해 주세요.",
      );
      check(
        s.event.name === p.expected_name,
        "다른 운영자가 행사 이름을 변경했습니다. 최신 이름을 확인해 주세요.",
      );
      s.event.name = p.name.trim();
      break;
    }
    case "operator_update":
    case "operator_remove": {
      operator();
      const member = s.members.find(
        (m) => m.user_id === p.user_id && m.role === "operator",
      );
      check(member, "이 행사의 운영자가 아닙니다.");
      if (cmd.kind === "operator_update") {
        check(
          typeof p.display_name === "string" &&
            p.display_name.trim().length >= 1 &&
            p.display_name.trim().length <= 80,
          "표시 이름은 1~80자로 입력해 주세요.",
        );
        check(
          member.display_name === p.expected_name,
          "다른 운영자가 이름을 수정했습니다. 최신 내용을 확인해 주세요.",
        );
        member.display_name = p.display_name.trim();
      } else {
        check(
          s.members.filter((m) => m.role === "operator").length > 1,
          "마지막 운영자는 제거할 수 없습니다.",
        );
        s.members = s.members.filter((m) => m !== member);
      }
      break;
    }
    case "operator_invitation_cancel":
    case "registered_member_remove": {
      operator();
      const inv = s.invitations.find(
        (i) =>
          i.id === p.invitation_id &&
          (cmd.kind === "registered_member_remove"
            ? i.registered_only
            : i.role === "operator") &&
          !i.accepted,
      );
      check(
        inv,
        "삭제 가능한 등록 멤버 또는 대기 중인 운영자 초대가 없습니다.",
      );
      check(
        inv.mail_status !== "sending",
        "메일 발송이 끝난 뒤 초대를 취소해 주세요.",
      );
      s.invitations = s.invitations.filter((i) => i !== inv);
      break;
    }
    case "start": {
      operator();
      const t = team();
      check(!activeSession(s), "이미 진행 중인 발표가 있습니다.");
      const pdf = s.submissions.find((x) => x.id === t.submission_id);
      check(pdf, "PDF 제출이 필요합니다.");
      s.sessions.push(prepareSession(t, pdf, s.event.settings, String(p.id)));
      break;
    }
    case "ready":
    case "pause":
    case "resume":
    case "reset":
    case "end":
    case "move": {
      const x = session();
      if (cmd.kind === "move")
        check(
          role === "operator" ||
            (role === "participant" && me.team_id === x.team_id),
        );
      else operator();
      Object.assign(x, transitionSession(x, cmd.kind, p, now));
      break;
    }
    case "submission": {
      const t = team();
      check(
        role === "operator" || (role === "participant" && me.team_id === t.id),
      );
      check(
        t.submission_id === (p.previous_id ?? null),
        "제출본이 변경되었습니다. 새로 확인해 주세요.",
      );
      const sub = p.submission as Submission;
      check(sub.pages > 0 && sub.bytes <= 20 * 1024 * 1024);
      if (role === "participant" && !t.submission_id && !p.profile)
        throw Error("팀 정보와 PDF를 함께 제출해 주세요.");
      if (p.profile) {
        validateTeamProfile(p.profile as TeamProfile);
        const profile = p.profile as TeamProfile;
        t.name = profile.name.trim();
        t.leader_name = profile.leader_name.trim();
        t.member_names = profile.member_names.map((name) => name.trim());
      }
      s.submissions.push(sub);
      t.submission_id = sub.id;
      break;
    }
    case "settings": {
      operator();
      validateSettings(p.settings as Snapshot["event"]["settings"]);
      s.event.settings = p.settings as Snapshot["event"]["settings"];
      break;
    }
    case "team": {
      operator();
      const name = String(p.name ?? "").trim();
      check(name.length > 0 && name.length <= 80, "팀명은 1~80자입니다.");
      const duration =
        p.duration_seconds === null ? null : Number(p.duration_seconds);
      check(
        duration === null ||
          (Number.isInteger(duration) && duration >= 10 && duration <= 7200),
      );
      if (p.team_id) {
        Object.assign(team(), {
          name,
          description: String(p.description ?? ""),
          duration_seconds: duration,
        });
      } else
        s.teams.push({
          id: String(p.id),
          event_id: s.event.id,
          name,
          description: String(p.description ?? ""),
          duration_seconds: duration,
          sort_index: s.teams.length,
          submission_id: null,
        });
      break;
    }
    case "reorder": {
      operator();
      const t = team();
      const rows = [...s.teams].sort((a, b) => a.sort_index - b.sort_index),
        index = rows.findIndex((x) => x.id === t.id),
        other = rows[index + Number(p.delta)];
      check(other, "순서를 더 변경할 수 없습니다.");
      [t.sort_index, other.sort_index] = [other.sort_index, t.sort_index];
      break;
    }
    case "rubric": {
      operator();
      const items = p.items as Snapshot["rubrics"][number]["items"];
      check(
        items.length > 0 &&
          items.length <= 20 &&
          items.every((i) => i.name.trim() && i.max > 0 && i.max <= 1000) &&
          new Set(items.map((i) => i.id)).size === items.length,
        "평가 항목과 배점을 확인해 주세요.",
      );
      const r = {
        id: String(p.id),
        event_id: s.event.id,
        version: Math.max(...s.rubrics.map((x) => x.version)) + 1,
        items,
      };
      s.rubrics.push(r);
      s.event.current_rubric_id = r.id;
      break;
    }
    case "review": {
      check(role === "judge");
      const t = team();
      check(
        s.assignments.some(
          (a) => a.team_id === t.id && a.judge_id === me.user_id,
        ),
      );
      let ev = s.evaluations.find(
        (x) => x.team_id === t.id && x.judge_id === me.user_id,
      );
      check(!ev || ev.status !== "submitted", "최종 제출된 심사입니다.");
      check(
        (ev?.version ?? 0) === p.version,
        "다른 탭에서 수정했습니다. 최신 내용을 불러오세요.",
      );
      const rubric_id = ev?.rubric_id ?? s.event.current_rubric_id;
      check(
        rubric_id === p.rubric_id,
        "평가 기준이 변경되었습니다. 다시 확인해 주세요.",
      );
      validateScores(
        p.scores as Record<string, number>,
        s.rubrics.find((x) => x.id === rubric_id)!,
        p.final === true,
      );
      check(String(p.notes ?? "").length <= 5000);
      if (!ev) {
        ev = {
          id: uuid(),
          event_id: s.event.id,
          team_id: t.id,
          judge_id: me.user_id,
          rubric_id,
          scores: {},
          notes: "",
          status: "draft",
          version: 0,
          updated_at: stamp,
        };
        s.evaluations.push(ev);
      }
      Object.assign(ev, {
        scores: p.scores,
        notes: String(p.notes ?? ""),
        status: p.final ? "submitted" : "draft",
        version: ev.version + 1,
        updated_at: stamp,
      });
      break;
    }
    case "reopen": {
      operator();
      const ev = s.evaluations.find((x) => x.id === p.evaluation_id);
      check(ev && ev.status === "submitted");
      ev.status = "draft";
      ev.version++;
      break;
    }
    case "invite": {
      operator();
      check(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email)),
        "이메일을 확인해 주세요.",
      );
      check(["operator", "judge", "participant"].includes(String(p.role)));
      if (p.role === "participant") team();
      s.invitations.push({
        registered_only: Boolean(p.registered_only),
        mail_status: "pending",
        id: String(p.id),
        event_id: s.event.id,
        email: String(p.email),
        role: p.role as Role,
        team_id: p.role === "participant" ? String(p.team_id) : null,
        display_name: String(p.display_name),
        accepted: false,
      });
      break;
    }
    case "assign": {
      operator();
      const t = team();
      check(
        s.members.some((m) => m.user_id === p.judge_id && m.role === "judge"),
      );
      s.assignments = s.assignments.filter(
        (a) => !(a.team_id === t.id && a.judge_id === p.judge_id),
      );
      if (p.assigned)
        s.assignments.push({
          event_id: s.event.id,
          team_id: t.id,
          judge_id: String(p.judge_id),
        });
      break;
    }
    default:
      throw Error("지원하지 않는 요청입니다.");
  }
  s.server_time = stamp;
  return s;
}
