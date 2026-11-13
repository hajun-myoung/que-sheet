"use client";
import { useRef, useState } from "react";
import { Copy, KeyRound, Mail } from "lucide-react";
import {
  configured,
  invokeEdge,
  issueParticipantCode,
  message,
  supabase,
} from "@/lib/client";
import { roleLabel, type Invitation, type Snapshot } from "@/lib/model";
import { useConfirm } from "./confirm";
export function ParticipantCodes({
  data,
  refresh,
}: {
  data: Snapshot;
  refresh: () => Promise<void>;
}) {
  const confirm = useConfirm(),
    [codes, setCodes] = useState<
      Record<string, { code: string; expires_at: string }>
    >({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  const registered = data.invitations.filter(
    (i) => i.registered_only && !i.accepted,
  );
  const recipients = registered.filter((i) =>
    ["pending", "failed", "sending"].includes(i.mail_status ?? "pending"),
  );
  async function sendAll() {
    if (lock.current || !recipients.length) return;
    if (
      !(await confirm(
        `등록된 멤버 ${recipients.length}명의 초대 메일 발송을 진행할까요? 참여자에게는 팀 코드와 접속 링크를, 운영자·심사위원에게는 이메일 인증 후 수락하는 초대 링크를 보냅니다. 유효한 코드가 없으면 새로 발급합니다.`,
      ))
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let completed = 0,
      problems = 0;
    try {
      for (const recipient of recipients) {
        setNotice(`초대 메일 처리 중… ${completed}/${recipients.length}`);
        const result = await invokeEdge<{ status: string }>(
          "send-invitations",
          { event_id: data.event.id, invitation_id: recipient.id },
        );
        if (result.status !== "sent") problems++;
        completed++;
        await refresh();
      }
      setNotice(
        `${completed}명 처리 완료${problems ? ` · ${problems}명은 아래 발송 상태를 확인해 주세요.` : " · 메일 서버가 발송을 접수했습니다."}`,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      lock.current = false;
      setBusy(false);
      await refresh();
    }
  }
  function memberLabel(i: Invitation) {
    const status = i.mail_status ?? "pending";
    const stale =
      status === "sending" &&
      i.mail_started_at &&
      Date.parse(i.mail_started_at) < Date.now() - 120000;
    return (
      <span className="registered-member" key={i.id}>
        <span>
          <strong>{i.display_name}</strong> · {i.email} · {roleLabel[i.role]}
        </span>
        <span>
          {
            {
              pending: "○ 발송 대기",
              sending: "◷ 발송 중",
              sent: "✓ 발송 완료",
              failed: "! 발송 실패",
              unknown: "? 수신 확인 필요",
            }[status]
          }
        </span>
        {i.mail_error && <small>{i.mail_error}</small>}
        {(status === "unknown" || stale) && (
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              if (
                !(await confirm(
                  "메일이 이미 도착했을 수도 있습니다. 수신 여부를 확인했으며 다시 보내시겠어요? 중복 메일이 도착할 수 있습니다.",
                ))
              )
                return;
              setBusy(true);
              setError("");
              try {
                const { error } = await supabase!.rpc("retry_unknown_email", {
                  p_event: data.event.id,
                  p_id: i.id,
                });
                if (error) throw error;
                await refresh();
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            수신 확인 후 재발송 준비
          </button>
        )}
      </span>
    );
  }
  async function issue(teamId: string) {
    if (lock.current) return;
    if (
      !(await confirm(
        "이 팀의 새 참여 코드를 발급할까요? 이전 코드는 새 접속에 사용할 수 없게 됩니다. 이미 접속한 팀원의 권한은 유지됩니다.",
      ))
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await issueParticipantCode(data.event.id, teamId);
      setCodes((c) => ({ ...c, [teamId]: result }));
      setNotice(
        "코드를 복사하거나 일괄 초대로 전달해 주세요. 코드를 재발급한 팀의 등록 멤버는 발송 대기로 변경됩니다.",
      );
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="card settings-card participant-codes">
      <h2>
        <KeyRound size={20} />
        참여 코드 발급
      </h2>
      <p className="help">
        팀별 코드는 7일 동안 유효합니다. 참여자는 로그인 화면에서 코드를 입력해
        팀 설문으로 접속합니다.
      </p>
      {data.teams.map((t) => (
        <div className="code-row" key={t.id}>
          <div>
            <strong>{t.name}</strong>
            <small>{t.submission_id ? "제출 완료" : "첫 제출 대기"}</small>
            <div className="registered-members">
              {registered.filter((i) => i.team_id === t.id).map(memberLabel)}
            </div>
          </div>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => void issue(t.id)}
          >
            코드 발급
          </button>
          {codes[t.id] && (
            <div className="issued-code">
              <code>{codes[t.id].code.match(/.{1,8}/g)?.join("-")}</code>
              <button
                className="icon-btn"
                aria-label={`${t.name} 참여 코드 복사`}
                onClick={() =>
                  void navigator.clipboard
                    .writeText(codes[t.id].code)
                    .then(() => setNotice("참여 코드를 복사했습니다."))
                    .catch(() =>
                      setError(
                        "복사하지 못했습니다. 표시된 코드를 직접 선택해 주세요.",
                      ),
                    )
                }
              >
                <Copy size={16} />
              </button>
              <small>
                {new Date(codes[t.id].expires_at).toLocaleDateString("ko-KR")}
                까지 유효
              </small>
            </div>
          )}
        </div>
      ))}
      {!data.teams.length && <p className="help">먼저 팀을 등록해 주세요.</p>}
      {registered.some((i) => !i.team_id) && (
        <div className="registered-members">
          <strong>운영자 · 심사위원</strong>
          {registered.filter((i) => !i.team_id).map(memberLabel)}
        </div>
      )}
      <p className="help">
        멤버 초대에서 ‘멤버만 등록하기’를 누르면 수신자가 여기에 표시됩니다.
        운영자·심사위원은 팀 참여 코드 대신 해당 역할의 초대 링크를 받습니다.
      </p>
      <button
        className="btn primary"
        disabled={!configured || busy || !recipients.length}
        onClick={() => void sendAll()}
      >
        <Mail size={16} />
        {busy ? "처리 중…" : `일괄 초대하기 (${recipients.length}명)`}
      </button>
      {!configured && (
        <p className="help">데모에서는 메일을 발송하지 않습니다.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="help" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
