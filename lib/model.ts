export type Role = "operator" | "participant" | "judge";
export type Status = "preparing" | "running" | "paused" | "ended";
export type Settings = {
  duration_seconds: number;
  warning_seconds: number;
  normal_color: string;
  warning_color: string;
  overtime_color: string;
};
export type Event = {
  id: string;
  name: string;
  subtitle: string;
  settings: Settings;
  current_rubric_id: string;
};
export type Member = {
  user_id: string;
  event_id: string;
  role: Role;
  team_id: string | null;
  display_name: string;
};
export type Team = {
  id: string;
  event_id: string;
  name: string;
  description: string;
  sort_index: number;
  duration_seconds: number | null;
  submission_id: string | null;
};
export type Submission = {
  id: string;
  event_id: string;
  team_id: string;
  name: string;
  path: string;
  pages: number;
  bytes: number;
  created_at: string;
};
export type Session = {
  id: string;
  event_id: string;
  team_id: string;
  submission_id: string;
  settings: Settings;
  status: Status;
  current_page: number;
  page_count: number;
  version: number;
  started_at: string | null;
  paused_at: string | null;
  paused_ms: number;
  ended_at: string | null;
};
export type Criterion = {
  id: string;
  name: string;
  description: string;
  max: number;
};
export type Rubric = {
  id: string;
  event_id: string;
  version: number;
  items: Criterion[];
};
export type Evaluation = {
  id: string;
  event_id: string;
  team_id: string;
  judge_id: string;
  rubric_id: string;
  scores: Record<string, number>;
  notes: string;
  status: "draft" | "submitted";
  version: number;
  updated_at: string;
};
export type Invitation = {
  id: string;
  event_id: string;
  email: string;
  role: Role;
  team_id: string | null;
  display_name: string;
  accepted: boolean;
};
export type Assignment = {
  event_id: string;
  team_id: string;
  judge_id: string;
};
export type Snapshot = {
  event: Event;
  me: Member;
  teams: Team[];
  submissions: Submission[];
  sessions: Session[];
  rubrics: Rubric[];
  evaluations: Evaluation[];
  members: Member[];
  assignments: Assignment[];
  invitations: Invitation[];
  server_time: string;
};
export type Command = {
  kind: string;
  event_id: string;
  request_id: string;
  payload: Record<string, unknown>;
};
export const defaults: Settings = {
  duration_seconds: 420,
  warning_seconds: 60,
  normal_color: "#FFFFFF",
  warning_color: "#FBBF24",
  overtime_color: "#FB7185",
};
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const roleLabel: Record<Role, string> = {
  operator: "운영자",
  participant: "참여자",
  judge: "심사위원",
};
export function activeSession(s: Snapshot) {
  return s.sessions.find((x) => x.status !== "ended");
}
export function remainingMs(s: Session, now: number) {
  if (!s.started_at) return s.settings.duration_seconds * 1000;
  const end =
    s.status === "paused"
      ? Date.parse(s.paused_at!)
      : s.status === "ended"
        ? Date.parse(s.ended_at!)
        : now;
  return (
    s.settings.duration_seconds * 1000 -
    Math.max(0, end - Date.parse(s.started_at) - s.paused_ms)
  );
}
export function timerView(ms: number, settings: Settings) {
  const overtime = ms < 0;
  const seconds = overtime ? Math.ceil(-ms / 1000) : Math.ceil(ms / 1000);
  const state = overtime
    ? "overtime"
    : ms <= settings.warning_seconds * 1000
      ? "warning"
      : "normal";
  return {
    text: `${overtime ? "+" : ""}${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
    label:
      state === "overtime"
        ? "시간 초과"
        : state === "warning"
          ? "종료 임박"
          : "발표 진행",
    color: settings[`${state}_color`],
    state,
  };
}
export function validateSettings(s: Settings) {
  if (
    !Number.isInteger(s.duration_seconds) ||
    s.duration_seconds < 10 ||
    s.duration_seconds > 7200
  )
    throw Error("발표 시간은 10초~120분으로 설정해 주세요.");
  if (
    !Number.isInteger(s.warning_seconds) ||
    s.warning_seconds < 0 ||
    s.warning_seconds > s.duration_seconds
  )
    throw Error("종료 임박 기준은 발표 시간 이하여야 합니다.");
  for (const c of [s.normal_color, s.warning_color, s.overtime_color]) {
    if (!/^#[0-9a-f]{6}$/i.test(c) || contrast(c, "#121116") < 4.5)
      throw Error("타이머 색상은 어두운 배경 대비 4.5:1 이상이어야 합니다.");
  }
}
export function contrast(a: string, b: string) {
  const lum = (h: string) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function validateScores(
  scores: Record<string, number>,
  r: Rubric,
  final: boolean,
) {
  if (Object.keys(scores).some((k) => !r.items.some((i) => i.id === k)))
    throw Error("평가 기준과 점수가 일치하지 않습니다.");
  for (const i of r.items) {
    const v = scores[i.id];
    if (v === undefined) {
      if (final) throw Error("모든 필수 점수를 입력해 주세요.");
      continue;
    }
    if (!Number.isFinite(v) || v < 0 || v > i.max)
      throw Error(`${i.name}: 0~${i.max}점 사이로 입력해 주세요.`);
  }
}
export function slideKey(key: string, target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (
    el?.closest?.(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]',
    )
  )
    return 0;
  return ["ArrowRight", "PageDown"].includes(key)
    ? 1
    : ["ArrowLeft", "PageUp"].includes(key)
      ? -1
      : 0;
}
export function uuid() {
  return crypto.randomUUID();
}

export function durationLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60),
    rest = seconds % 60;
  return (
    [minutes ? `${minutes}분` : "", rest ? `${rest}초` : ""]
      .filter(Boolean)
      .join(" ") || "0초"
  );
}
