import type { Session, Settings, Submission, Team } from "./model";
export function prepareSession(
  team: Team,
  pdf: Submission,
  defaults: Settings,
  id: string,
): Session {
  const settings = {
    ...defaults,
    duration_seconds: team.duration_seconds ?? defaults.duration_seconds,
  };
  settings.warning_seconds = Math.min(
    settings.warning_seconds,
    settings.duration_seconds,
  );
  return {
    id,
    event_id: team.event_id,
    team_id: team.id,
    submission_id: pdf.id,
    settings,
    status: "preparing",
    current_page: 1,
    page_count: pdf.pages,
    version: 1,
    started_at: null,
    paused_at: null,
    paused_ms: 0,
    ended_at: null,
  };
}
// Pure state transitions. Callers own authorization; rehearsal never invokes server RPCs.
export function transitionSession(
  current: Session,
  kind: string,
  p: Record<string, unknown>,
  now = Date.now(),
): Session {
  if (current.status === "ended" || p.session_id !== current.id)
    throw Error("종료되었거나 없는 세션입니다.");
  if (current.version !== p.version)
    throw Error("상태가 변경되었습니다. 동기화 후 다시 시도해 주세요.");
  const s = { ...current },
    stamp = new Date(now).toISOString();
  const requireState = (...states: Session["status"][]) => {
    if (!states.includes(s.status))
      throw Error("현재 발표 상태에서는 실행할 수 없습니다.");
  };
  switch (kind) {
    case "move": {
      requireState("running", "paused");
      const delta = Number(p.delta);
      if (
        ![1, -1].includes(delta) ||
        s.current_page + delta < 1 ||
        s.current_page + delta > s.page_count
      )
        throw Error("첫 장 또는 마지막 장입니다.");
      s.current_page += delta;
      break;
    }
    case "ready":
      requireState("preparing");
      s.status = "running";
      s.started_at = stamp;
      break;
    case "pause":
      requireState("running");
      s.status = "paused";
      s.paused_at = stamp;
      break;
    case "resume":
      requireState("paused");
      s.paused_ms += now - Date.parse(s.paused_at!);
      s.paused_at = null;
      s.status = "running";
      break;
    case "reset":
      requireState("running", "paused");
      s.started_at = stamp;
      s.paused_ms = 0;
      if (s.status === "paused") s.paused_at = stamp;
      break;
    case "end":
      if (s.status === "paused") s.paused_ms += now - Date.parse(s.paused_at!);
      s.status = "ended";
      s.ended_at = stamp;
      s.paused_at = null;
      break;
    default:
      throw Error("지원하지 않는 발표 요청입니다.");
  }
  s.version++;
  return s;
}
