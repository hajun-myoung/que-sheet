"use client";
import { useConfirm } from "./confirm";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Pause,
  Play,
  RotateCcw,
  Square,
  WifiOff,
} from "lucide-react";
import { PdfViewer } from "./pdf-viewer";
import {
  activeSession,
  durationLabel,
  remainingMs,
  slideKey,
  timerView,
  type Snapshot,
  type Command,
} from "@/lib/model";
import { request, message } from "@/lib/client";
export function Presenter({
  data,
  mutate,
  offset,
  connection,
  onClose,
  hostRef,
}: {
  data: Snapshot;
  mutate: (c: Command) => Promise<void>;
  offset: number;
  connection: string;
  onClose: () => void;
  hostRef: React.RefObject<HTMLDivElement | null>;
}) {
  const confirm = useConfirm();
  const s = activeSession(data),
    [now, setNow] = useState(Date.now()),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [fullscreen, setFullscreen] = useState(false);
  const pending = useRef(false),
    lastFailed = useRef<Command | null>(null),
    sref = useRef(s);
  sref.current = s;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    const change = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", change);
    change();
    return () => {
      clearInterval(timer);
      document.removeEventListener("fullscreenchange", change);
    };
  }, []);
  const action = useCallback(
    async (
      kind: string,
      extra: Record<string, unknown> = {},
      retry = false,
    ) => {
      const current = sref.current;
      if (!current || pending.current) return;
      pending.current = true;
      setBusy(true);
      setError("");
      const cmd =
        retry && lastFailed.current
          ? lastFailed.current
          : request(kind, data.event.id, {
              session_id: current.id,
              version: current.version,
              ...extra,
            });
      try {
        await mutate(cmd);
        lastFailed.current = null;
      } catch (e) {
        lastFailed.current = cmd;
        setError(message(e));
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [mutate, data.event.id],
  );
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const direction = slideKey(e.key, e.target);
      if (
        !direction ||
        e.altKey ||
        e.metaKey ||
        e.ctrlKey ||
        document.querySelector("dialog[open]")
      )
        return;
      e.preventDefault();
      if (!e.repeat) void action("move", { delta: direction });
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [action]);
  const enter = () => {
    if (!hostRef.current?.requestFullscreen) {
      setError(
        "이 브라우저는 전체화면을 지원하지 않습니다. 화면을 최대화해 주세요.",
      );
      return;
    }
    void hostRef.current
      .requestFullscreen()
      .catch(() =>
        setError(
          "전체화면 진입이 허용되지 않았습니다. 전체화면 버튼을 다시 눌러 주세요.",
        ),
      );
  };
  if (!s)
    return (
      <div className="presenter-ended">
        <h2>발표가 종료되었습니다</h2>
        <button className="btn primary" onClick={onClose}>
          운영 화면으로 돌아가기
        </button>
      </div>
    );
  const pdf = data.submissions.find((x) => x.id === s.submission_id),
    team = data.teams.find((x) => x.id === s.team_id),
    view = timerView(remainingMs(s, now + offset), s.settings);
  return (
    <>
      <div className="presentation-top">
        <button
          className="icon-btn"
          onClick={onClose}
          aria-label="운영 화면으로 돌아가기"
        >
          <ArrowLeft size={20} />
        </button>
        <span>
          {team?.name}
          <small>발표 화면</small>
        </span>
        <div className="grow" />
        {connection !== "online" && (
          <span className="connection">
            <WifiOff size={15} />
            재연결 중
          </span>
        )}
        <button className="btn ghost" onClick={enter}>
          <Maximize size={16} />
          {fullscreen ? "전체화면" : "전체화면 재진입"}
        </button>
      </div>
      <div className="presentation-slide">
        {pdf && (
          <PdfViewer
            submission={pdf}
            page={s.current_page}
            dark
            onReady={() => {
              if (sref.current?.status === "preparing") void action("ready");
            }}
          />
        )}
      </div>
      <div className="presentation-timer" style={{ color: view.color }}>
        <span className="timer-state">
          {s.status === "preparing"
            ? "◷ 자료 준비 중"
            : s.status === "paused"
              ? "Ⅱ 일시정지"
              : `${view.state === "overtime" ? "!" : view.state === "warning" ? "◷" : "●"} ${view.label}`}
        </span>
        <strong>{s.status === "preparing" ? "--:--" : view.text}</strong>
        <span className="timer-total">
          총 {durationLabel(s.settings.duration_seconds)}
        </span>
      </div>
      <div className="presentation-controls">
        <div className="control-group">
          <button
            className="icon-btn"
            aria-label="이전 장표"
            disabled={busy || s.current_page === 1 || s.status === "preparing"}
            onClick={() => void action("move", { delta: -1 })}
          >
            <ChevronLeft />
          </button>
          <span>
            {s.current_page} <em>/ {s.page_count}</em>
          </span>
          <button
            className="icon-btn"
            aria-label="다음 장표"
            disabled={
              busy ||
              s.current_page === s.page_count ||
              s.status === "preparing"
            }
            onClick={() => void action("move", { delta: 1 })}
          >
            <ChevronRight />
          </button>
        </div>
        <div className="control-group">
          <button
            className="btn ghost"
            disabled={busy || s.status === "preparing"}
            onClick={() =>
              void action(s.status === "paused" ? "resume" : "pause")
            }
          >
            {s.status === "paused" ? <Play size={16} /> : <Pause size={16} />}{" "}
            {s.status === "paused" ? "재개" : "일시정지"}
          </button>
          <button
            className="btn ghost"
            disabled={busy || s.status === "preparing"}
            onClick={async () => {
              if (
                await confirm(
                  "타이머를 처음으로 초기화할까요? 현재 장표와 일시정지 상태는 유지됩니다.",
                )
              )
                void action("reset", { session_id: s.id, version: s.version });
            }}
          >
            <RotateCcw size={16} />
            초기화
          </button>
          <button
            className="btn end"
            disabled={busy}
            onClick={async () => {
              if (await confirm("현재 발표를 종료할까요?"))
                void action("end", { session_id: s.id, version: s.version });
            }}
          >
            <Square size={14} />
            발표 종료
          </button>
        </div>
      </div>
      {error && (
        <div className="presenter-error" role="alert">
          {error}
          <button
            className="btn ghost"
            onClick={() => void action("", {}, true)}
          >
            요청 재시도
          </button>
          <button className="btn ghost" onClick={() => setError("")}>
            닫기
          </button>
        </div>
      )}
    </>
  );
}
