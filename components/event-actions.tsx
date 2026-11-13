"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { invokeEdge, message, supabase } from "@/lib/client";
import { activeSession, uuid, type Snapshot } from "@/lib/model";

export function EventActions({
  data,
  openEvent,
  refresh,
  action = "create",
}: {
  data: Snapshot;
  openEvent: (id: string) => void;
  refresh: () => Promise<void>;
  action?: "create" | "delete";
}) {
  const titleId = useId();
  const [mode, setMode] = useState<"create" | "delete" | null>(null),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    requestId = useRef(uuid()),
    lock = useRef(false);
  useEffect(() => {
    if (mode) dialog.current?.showModal();
    else dialog.current?.close();
  }, [mode]);
  const open = (next: "create" | "delete") => {
    setName("");
    setError("");
    requestId.current = uuid();
    setMode(next);
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (mode === "create") {
        const { data: id, error } = await supabase!.rpc("create_event", {
          p_name: name.trim(),
          p_request: requestId.current,
        });
        if (error) throw error;
        openEvent(id);
      } else {
        await invokeEdge("delete-event", { event_id: data.event.id, name });
        openEvent("");
      }
      setMode(null);
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {action === "create" ? (
        <button className="btn secondary" onClick={() => open("create")}>
          <Plus size={16} />새 행사 만들기
        </button>
      ) : (
        <button
          className="text-button event-delete-button"
          onClick={() => open("delete")}
        >
          <Trash2 size={15} />
          행사 삭제
        </button>
      )}
      <dialog
        ref={dialog}
        className="confirm-dialog"
        aria-labelledby={titleId}
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) setMode(null);
        }}
      >
        <h2 id={titleId}>
          {mode === "create" ? "새 행사 만들기" : "행사 삭제"}
        </h2>
        <p>
          {mode === "create"
            ? "새 행사의 운영자로 등록됩니다. 기존 행사와 발표 상태는 유지됩니다."
            : "팀, 심사 결과, 발표 기록과 제출 PDF를 모두 삭제합니다. 계정과 다른 행사는 유지됩니다. 삭제 후 되돌릴 수 없습니다."}
        </p>
        {mode === "delete" && activeSession(data) && (
          <p className="error" role="alert">
            진행 중인 발표를 먼저 종료해 주세요.
          </p>
        )}
        <form onSubmit={submit}>
          <label className="field">
            {mode === "create"
              ? "새 행사 이름"
              : `확인을 위해 ‘${data.event.name}’ 입력`}
            <input
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => setMode(null)}
            >
              취소
            </button>
            <button
              className="btn primary"
              disabled={
                busy ||
                !name.trim() ||
                (mode === "delete" &&
                  (name !== data.event.name || Boolean(activeSession(data))))
              }
            >
              {busy
                ? "처리 중…"
                : mode === "create"
                  ? "행사 만들기"
                  : "영구 삭제하기"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
export function PendingDeletions({
  events,
  refresh,
}: {
  events: { id: string; name: string }[];
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!events.length) return null;
  return (
    <section className="notice deletion-recovery" aria-label="삭제 파일 정리">
      <div>
        <strong>삭제한 행사의 PDF 정리가 남아 있습니다.</strong>
        <p>행사 접근은 차단되었습니다. 파일 정리를 다시 시도해 주세요.</p>
        {events.map((e) => (
          <button
            key={e.id}
            className="btn secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await invokeEdge<{ cleanup_pending: boolean }>(
                  "delete-event",
                  { event_id: e.id, name: e.name },
                );
                if (result.cleanup_pending)
                  setError(
                    "저장소 정리가 아직 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.",
                  );
                await refresh();
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {e.name} 파일 정리 재시도
          </button>
        ))}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
