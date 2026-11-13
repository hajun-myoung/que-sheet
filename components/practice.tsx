"use client";
import { useEffect, useRef, useState } from "react";
import { flushSync, createPortal } from "react-dom";
import { Play } from "lucide-react";
import {
  durationLabel,
  uuid,
  type Snapshot,
  type Team,
  type Session,
  type Command,
} from "@/lib/model";
import { prepareSession, transitionSession } from "@/lib/presentation";
import { Presenter } from "./presenter";
export function Practice({
  data,
  team,
  onOpenChange,
}: {
  data: Snapshot;
  team: Team;
  onOpenChange: (open: boolean) => void;
}) {
  const key = `cue-practice:${data.me.user_id}:${data.event.id}:${team.id}`;
  const [session, setSession] = useState<Session | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const current = useRef<Session | null>(null),
    host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as Session;
        if (
          saved.team_id === team.id &&
          saved.event_id === data.event.id &&
          saved.status !== "ended" &&
          data.submissions.some((p) => p.id === saved.submission_id)
        ) {
          current.current = saved;
          setSession(saved);
        }
      }
    } catch {
      setError("저장된 연습을 복원하지 못했습니다. 새로 시작해 주세요.");
    }
    return () => onOpenChange(false);
  }, [key]);
  function persist(s: Session) {
    current.current = s;
    setSession(s);
    try {
      sessionStorage.setItem(key, JSON.stringify(s));
    } catch {
      setError(
        "연습은 계속할 수 있지만 새로고침 복원용 저장 공간이 부족합니다.",
      );
    }
  }
  function start() {
    const pdf = data.submissions.find((p) => p.id === team.submission_id);
    if (!pdf) return;
    if (!current.current || current.current.status === "ended")
      persist(
        prepareSession(team, pdf, data.event.settings, `practice-${uuid()}`),
      );
    flushSync(() => {
      setOpen(true);
      onOpenChange(true);
    });
    void host.current
      ?.requestFullscreen?.()
      .catch(() => setError("전체화면 재진입 버튼을 눌러 주세요."));
  }
  async function mutate(command: Command) {
    if (!current.current) throw Error("연습을 먼저 시작해 주세요.");
    persist(transitionSession(current.current, command.kind, command.payload));
  }
  function close() {
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => {});
    setOpen(false);
    onOpenChange(false);
  }
  return (
    <>
      <button
        className="btn primary start-button"
        disabled={!team.submission_id}
        onClick={start}
      >
        <Play size={17} />
        {session && session.status !== "ended"
          ? "연습 이어하기"
          : `발표 연습하기(${durationLabel(team.duration_seconds ?? data.event.settings.duration_seconds)})`}
      </button>
      {error && !open && (
        <p className="help" role="status">
          {error}
        </p>
      )}
      {createPortal(
        <div
          ref={host}
          className={`presentation-container ${open ? "is-open" : ""}`}
          aria-label="발표 연습 화면"
        >
          {open && session && (
            <Presenter
              data={{ ...data, sessions: [session] }}
              mutate={mutate}
              offset={0}
              connection="online"
              hostRef={host}
              onClose={close}
              practice
            />
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
