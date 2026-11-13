"use client";
import { useRef, useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { issueParticipantCode, message } from "@/lib/client";
import type { Snapshot } from "@/lib/model";
import { useConfirm } from "./confirm";
export function ParticipantCodes({ data }: { data: Snapshot }) {
  const confirm = useConfirm(),
    [codes, setCodes] = useState<
      Record<string, { code: string; expires_at: string }>
    >({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
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
        "코드를 복사해 팀에 전달해 주세요. 이 화면을 나가면 발급된 원문을 다시 조회할 수 없습니다.",
      );
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
