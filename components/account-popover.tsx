"use client";
import { useId, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  LogOut,
  UserRound,
  X,
} from "lucide-react";
import { configured } from "@/lib/client";
import { roleLabel, type Snapshot } from "@/lib/model";
import { EventActions } from "./event-actions";

export function AccountPopover({
  data,
  email,
  googleName,
  events,
  openEvent,
  refresh,
  navigate,
  logout,
}: {
  data: Snapshot;
  email: string | null;
  googleName: string | null;
  events: { id: string; name: string }[];
  openEvent: (id: string) => void;
  refresh: () => Promise<void>;
  navigate: (fn: () => void) => Promise<void>;
  logout: () => Promise<void>;
}) {
  const id = useId(),
    panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const choices = events.length ? events : [data.event];
  return (
    <>
      <button
        className="avatar account-trigger"
        popoverTarget={id}
        aria-label="계정 메뉴"
        aria-expanded={open}
        aria-controls={id}
      >
        <UserRound size={19} aria-hidden="true" />
      </button>
      <div
        id={id}
        ref={panel}
        popover="auto"
        className="account-popover"
        role="dialog"
        aria-label="계정 및 행사"
        onToggle={(e) => setOpen(e.newState === "open")}
      >
        <div className="account-popover-heading">
          <span>내 계정</span>
          <button
            className="icon-btn"
            aria-label="계정 메뉴 닫기"
            popoverTarget={id}
            popoverTargetAction="hide"
            autoFocus
          >
            <X size={19} />
          </button>
        </div>
        <div className="account-identity">
          <span className="avatar account-avatar">
            <UserRound size={32} />
          </span>
          {googleName && <strong>{googleName}님</strong>}
          <span className="account-email">
            {email ?? (configured ? "참여 코드로 접속 중" : "데모 계정")}
          </span>
          <small>{roleLabel[data.me.role]}</small>
        </div>
        <details className="account-events">
          <summary>
            <CalendarDays size={21} />
            <span>
              <small>현재 행사</small>
              <strong>{data.event.name}</strong>
            </span>
            <ChevronDown size={19} className="event-chevron" />
          </summary>
          <div className="account-event-list" aria-label="행사 전환">
            {choices.map((event) => (
              <button
                key={event.id}
                aria-current={event.id === data.event.id ? "true" : undefined}
                onClick={() =>
                  void navigate(() => {
                    openEvent(event.id);
                    panel.current?.hidePopover();
                  })
                }
              >
                <span>{event.name}</span>
                {event.id === data.event.id && <Check size={17} />}
              </button>
            ))}
          </div>
        </details>
        {configured && data.me.role === "operator" && (
          <div className="account-create">
            <EventActions
              data={data}
              openEvent={(id) => {
                openEvent(id);
                panel.current?.hidePopover();
              }}
              refresh={refresh}
            />
          </div>
        )}
        <button
          className="account-logout"
          onClick={() =>
            void navigate(() => {
              void logout().catch((e) =>
                setError(
                  e instanceof Error ? e.message : "로그아웃에 실패했습니다.",
                ),
              );
            })
          }
        >
          <LogOut size={17} />
          로그아웃
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
