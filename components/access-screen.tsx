"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ClipboardCheck,
  KeyRound,
  Mail,
  MonitorPlay,
  Users,
} from "lucide-react";
import { configured, supabase, message } from "@/lib/client";
import { roleLabel, uuid, type Role } from "@/lib/model";
export function AccessScreen({
  login,
  refresh,
  signedIn,
  events,
  setEventId,
  loadError,
  logout,
}: {
  login: (role: Role, code?: string) => Promise<void>;
  refresh: () => Promise<void>;
  signedIn: boolean;
  events: { id: string; name: string }[];
  setEventId: (id: string) => void;
  loadError: string;
  logout: () => Promise<void>;
}) {
  const [role, setRole] = useState<Role>("participant"),
    [code, setCode] = useState(""),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [invite, setInvite] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const createId = useRef(uuid());
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setInvite(params.get("invite") ?? "");
    const r = params.get("role");
    if (r === "operator" || r === "judge") setRole(r);
  }, []);
  async function submit(action = "login") {
    setBusy(true);
    setNotice("");
    try {
      if (!configured || role === "participant") {
        await login(role, code);
        return;
      }
      if (action === "create") {
        const { data, error } = await supabase!.rpc("create_event", {
          p_name: name,
          p_request: createId.current,
        });
        if (error) throw error;
        setEventId(data);
        await refresh();
        return;
      }
      if (action === "invite") {
        const { data, error } = await supabase!.rpc("accept_invitation", {
          p_id: invite,
        });
        if (error) throw error;
        setEventId(data);
        history.replaceState(null, "", "/");
        await refresh();
        return;
      }
      // End an anonymous code session before starting staff email authentication.
      const current = await supabase!.auth.getUser();
      if (current.data.user?.is_anonymous) await supabase!.auth.signOut();
      const redirect = new URL(location.origin);
      redirect.searchParams.set("role", role);
      if (invite) redirect.searchParams.set("invite", invite);
      const { error } = await supabase!.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirect.href },
      });
      if (error) throw error;
      setNotice("로그인 링크를 이메일로 보냈습니다. 메일함을 확인해 주세요.");
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="access-page">
      <section className="access-intro">
        <a className="access-brand" href="/">
          <span className="brand-mark">
            q<span>•</span>
          </span>
          <strong>큐:시트</strong>
        </a>
        <span className="eyebrow">YOUR NEXT PRESENTATION</span>
        <h1>
          매끄러운 발표에
          <br />
          집중할 수 있도록.
        </h1>
        <p>
          자료 제출부터 발표 연습, 현장 진행과 심사까지,
          <br />
          큐:시트가 도와드립니다
        </p>
        <div className="access-steps">
          <span>01 자료 제출</span>
          <span>02 발표연습</span>
          <span>03 심사와 피드백</span>
        </div>
      </section>
      <section className="card access-card">
        <span className="eyebrow">WELCOME TO CUE</span>
        <h2>어떤 역할로 참여하시나요?</h2>
        <p className="muted">역할을 선택하고 나의 공간으로 접속하세요.</p>
        <div className="role-picker" role="group" aria-label="로그인 역할">
          {(
            [
              ["participant", Users, "자료 제출 · 발표 연습"],
              ["operator", MonitorPlay, "행사 운영 · 팀 관리"],
              ["judge", ClipboardCheck, "팀 평가 · 점수 제출"],
            ] as const
          ).map(([value, Icon, description]) => (
            <button
              key={value}
              aria-pressed={role === value}
              className={role === value ? "active" : ""}
              disabled={busy}
              onClick={() => {
                setRole(value);
                setNotice("");
              }}
            >
              <Icon size={21} />
              <strong>{roleLabel[value]}</strong>
              <small>{description}</small>
            </button>
          ))}
        </div>
        {!configured && (
          <div className="access-demo">
            <strong>데모 체험</strong>
            <span>
              운영자·심사위원은 바로 접속할 수 있습니다. 실제 계정 권한과 분리된
              로컬 데모입니다.
            </span>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {role === "participant" ? (
            <>
              <label className="field">
                참여 코드
                <input
                  required
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="characters"
                  maxLength={80}
                  placeholder="운영자에게 받은 코드를 입력하세요"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <p className="help">
                첫 접속 후 팀 정보와 PDF를 제출합니다. 제출한 팀은 같은 코드로
                다시 접속할 수 있습니다.
              </p>
              {!configured && (
                <p className="demo-code-hint">
                  첫 제출 체험:{" "}
                  <button type="button" onClick={() => setCode("CUE2026")}>
                    CUE2026
                  </button>{" "}
                  · 제출 완료 팀:{" "}
                  <button type="button" onClick={() => setCode("READY2026")}>
                    READY2026
                  </button>
                </p>
              )}
            </>
          ) : configured ? (
            <label className="field">
              {roleLabel[role]} 이메일
              <input
                type="email"
                required
                value={email}
                placeholder="name@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          ) : (
            <p className="help">
              {role === "operator"
                ? "팀을 등록하고 참여 코드를 발급하거나 발표를 진행합니다."
                : "배정된 팀의 점수와 비고를 입력하고 평가를 제출합니다."}
            </p>
          )}
          <button className="btn primary access-submit" disabled={busy}>
            {role === "participant" ? (
              <KeyRound size={17} />
            ) : configured ? (
              <Mail size={17} />
            ) : (
              <ArrowRight size={17} />
            )}{" "}
            {busy
              ? "확인 중…"
              : role === "participant"
                ? "코드로 접속하기"
                : configured
                  ? "이메일로 로그인"
                  : `${roleLabel[role]}${role === "judge" ? "으로" : "로"} 체험하기`}
          </button>
        </form>
        {configured && signedIn && role !== "participant" && (
          <div className="access-onboarding">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit("invite");
              }}
            >
              <label className="field">
                초대 ID
                <input
                  required
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                />
              </label>
              <button className="btn secondary" disabled={busy}>
                초대 수락
              </button>
            </form>
            {role === "operator" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit("create");
                }}
              >
                <label className="field">
                  새 행사 이름
                  <input
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button className="btn secondary" disabled={busy}>
                  행사 만들기
                </button>
              </form>
            )}
            {events.map((e) => (
              <button
                key={e.id}
                className="text-button"
                onClick={() => setEventId(e.id)}
              >
                {e.name} 열기
              </button>
            ))}
            <button className="text-button" onClick={() => void logout()}>
              다른 계정으로 로그인
            </button>
          </div>
        )}
        {(notice || loadError) && (
          <p className="auth-notice" role="status">
            {notice || loadError}
          </p>
        )}
        <p className="access-footer">
          {configured
            ? "운영자·심사위원의 실제 권한은 행사 배정에 따라 결정됩니다."
            : "체험 데이터는 현재 브라우저에 저장됩니다."}
        </p>
      </section>
    </main>
  );
}
