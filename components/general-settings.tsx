"use client";
import { useRef, useState } from "react";
import { Copy, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { configured } from "@/lib/client";
import { uuid, type Snapshot } from "@/lib/model";
import { EventActions } from "./event-actions";
import { useConfirm } from "./confirm";

export function GeneralSettings({
  data,
  run,
  refresh,
  openEvent,
}: {
  data: Snapshot;
  run: (kind: string, payload: Record<string, unknown>) => Promise<void>;
  refresh: () => Promise<void>;
  openEvent: (id: string) => void;
}) {
  const confirm = useConfirm(),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const operators = data.members.filter((m) => m.role === "operator");
  async function save(kind: string, payload: Record<string, unknown>) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await run(kind, payload);
      setNotice("저장되었습니다.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청을 완료하지 못했습니다.");
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="general-settings">
      <section className="card settings-card">
        <h2>행사 기본 정보</h2>
        <p className="muted">
          변경한 이름은 이 행사에 참여하는 모든 사람에게 표시됩니다.
        </p>
        <form
          key={data.event.name}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save("event_rename", {
              name: f.get("name"),
              expected_name: data.event.name,
            });
          }}
        >
          <label className="field">
            행사 이름
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={data.event.name}
              disabled={busy}
            />
          </label>
          <button className="btn primary" disabled={busy}>
            <Save size={16} />
            행사 이름 저장
          </button>
        </form>
      </section>
      <section className="card settings-card">
        <div className="section-title">
          <h2>
            <ShieldCheck size={20} />
            운영자 관리
          </h2>
          <span className="badge light-crimson">{operators.length}명</span>
        </div>
        <p className="muted">
          운영자는 행사 설정, 자료와 심사를 함께 관리합니다. 최소 한 명의
          운영자가 필요합니다.
        </p>
        <div className="operator-list">
          {operators.map((m) => (
            <form
              key={`${m.user_id}-${m.display_name}`}
              className="operator-row"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void save("operator_update", {
                  user_id: m.user_id,
                  display_name: f.get("name"),
                  expected_name: m.display_name,
                });
              }}
            >
              <span className="avatar">{m.display_name[0]}</span>
              <label className="field">
                행사 내 표시 이름 {m.user_id === data.me.user_id && "· 나"}
                <input
                  name="name"
                  aria-label={`${m.display_name} 표시 이름`}
                  required
                  maxLength={80}
                  defaultValue={m.display_name}
                  disabled={busy}
                />
              </label>
              <div className="button-row">
                <button className="btn secondary" disabled={busy}>
                  수정
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${m.display_name} 운영자 제거`}
                  title={
                    operators.length === 1
                      ? "마지막 운영자는 제거할 수 없습니다"
                      : "이 행사의 운영자 권한 제거"
                  }
                  disabled={busy || operators.length === 1}
                  onClick={async () => {
                    if (
                      await confirm(
                        `${m.display_name}님의 이 행사 운영자 권한을 제거할까요?${m.user_id === data.me.user_id ? " 본인의 행사 접근 권한을 잃게 됩니다." : ""} 계정과 다른 행사 권한은 유지됩니다.`,
                      )
                    )
                      await save("operator_remove", { user_id: m.user_id });
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </form>
          ))}
        </div>
        <hr />
        <h3>운영자 초대</h3>
        <p className="help">
          초대 링크를 전달해 주세요. 해당 이메일로 로그인하고 초대를 수락하면
          운영자 권한이 부여됩니다.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            void save("invite", {
              id: uuid(),
              role: "operator",
              display_name: f.get("name"),
              email: f.get("email"),
              registered_only: false,
            }).then((ok) => {
              if (ok) form.reset();
            });
          }}
        >
          <div className="form-grid">
            <label className="field">
              운영자 이름
              <input name="name" required maxLength={80} disabled={busy} />
            </label>
            <label className="field">
              운영자 이메일
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                placeholder="name@example.com"
                disabled={busy}
              />
            </label>
          </div>
          <button className="btn secondary" disabled={busy}>
            <Plus size={16} />
            운영자 초대 링크 만들기
          </button>
        </form>
        <div className="invite-list">
          {data.invitations
            .filter((i) => i.role === "operator" && !i.accepted)
            .map((i) => (
              <div key={i.id}>
                <div>
                  <strong>{i.display_name}</strong>
                  <small>
                    {i.email} · {i.registered_only ? "등록됨" : "초대 대기"}
                  </small>
                </div>
                <div className="button-row">
                  <button
                    className="icon-btn"
                    aria-label={`${i.display_name} 운영자 초대 링크 복사`}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `${location.origin}/?role=operator&invite=${i.id}`,
                        );
                        setNotice("초대 링크를 복사했습니다.");
                      } catch {
                        setError(
                          "클립보드에 접근할 수 없습니다. 초대 링크: " +
                            `${location.origin}/?role=operator&invite=${i.id}`,
                        );
                      }
                    }}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || i.mail_status === "sending"}
                    onClick={async () => {
                      if (
                        await confirm(
                          `${i.display_name}님의 운영자 초대를 취소할까요? 기존 링크는 사용할 수 없게 됩니다.`,
                        )
                      )
                        await save("operator_invitation_cancel", {
                          invitation_id: i.id,
                        });
                    }}
                  >
                    초대 취소
                  </button>
                </div>
              </div>
            ))}
        </div>
      </section>
      <section className="card settings-card danger-zone">
        <h2>행사 삭제</h2>
        <p className="muted">
          팀, 심사 결과, 발표 기록과 제출 PDF를 모두 삭제합니다. 삭제한 행사는
          복구할 수 없습니다.
        </p>
        {configured ? (
          <EventActions
            action="delete"
            data={data}
            refresh={refresh}
            openEvent={openEvent}
          />
        ) : (
          <p className="help">
            행사 생성·삭제는 Supabase에 연결한 환경에서 사용할 수 있습니다.
          </p>
        )}
      </section>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice compact" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
