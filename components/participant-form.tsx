"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  FileText,
  LogOut,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useConfirm } from "./confirm";
import { message, uploadPdf } from "@/lib/client";
import {
  uuid,
  validateTeamProfile,
  type Command,
  type Snapshot,
  type Team,
  type TeamProfile,
} from "@/lib/model";
export function ParticipantForm({
  data,
  team,
  mutate,
  refresh,
  logout,
}: {
  data: Snapshot;
  team: Team;
  mutate: (c: Command) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [name, setName] = useState(team.name),
    [leader, setLeader] = useState(team.leader_name ?? ""),
    [members, setMembers] = useState((team.member_names ?? []).join("\n")),
    [file, setFile] = useState<File | null>(null),
    [progress, setProgress] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    attempt = useRef<{
      id: string;
      createdAt: string;
      data: Snapshot;
      profile: TeamProfile;
      file: File;
    } | null>(null);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const change = () => {
    setDirty(true);
    attempt.current = null;
    setError("");
  };
  async function submit() {
    if (busy) return;
    setError("");
    try {
      if (!file) throw Error("발표 PDF 파일을 선택해 주세요.");
      const profile = {
        name: name.trim(),
        leader_name: leader.trim(),
        member_names: members
          .split("\n")
          .map((n) => n.trim())
          .filter(Boolean),
      };
      validateTeamProfile(profile);
      attempt.current ??= {
        id: uuid(),
        createdAt: new Date().toISOString(),
        data,
        profile,
        file,
      };
      setBusy(true);
      const a = attempt.current;
      await uploadPdf(
        a.file,
        team.id,
        a.data,
        setProgress,
        mutate,
        a.id,
        a.createdAt,
        a.profile,
      );
      setDirty(false);
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="survey-page">
      <header className="survey-nav">
        <a href="/" className="access-brand">
          <span className="brand-mark">
            q<span>•</span>
          </span>
          <strong>큐</strong>
        </a>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={async () => {
            if (
              !dirty ||
              (await confirm(
                "제출하지 않은 입력이 사라집니다. 로그인 화면으로 돌아갈까요?",
              ))
            ) {
              setDirty(false);
              try {
                await logout();
              } catch (e) {
                setError(message(e));
              }
            }
          }}
        >
          <LogOut size={15} />
          로그인 화면
        </button>
      </header>
      <form
        className="survey-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <section className="card survey-intro">
          <span className="eyebrow">PRESENTATION SUBMISSION</span>
          <h1>{data.event.name}</h1>
          <h2>발표 참가 신청</h2>
          <p>
            함께할 팀을 소개하고 발표자료를 제출해 주세요.
            <br />
            제출이 완료되면 자료를 확인하고 발표를 연습할 수 있습니다.
          </p>
          <div className="survey-meta">
            <ShieldCheck size={15} />
            {team.name} 팀의 참여 코드로 접속했습니다
            {!data.me.user_id.includes("-") && <span>· 데모</span>}
          </div>
          <p className="required-note">* 필수 입력 항목</p>
        </section>
        <section className="card survey-question">
          <label className="field" htmlFor="survey-team">
            팀명 <span className="required">*</span>
            <input
              id="survey-team"
              required
              maxLength={80}
              disabled={busy}
              value={name}
              placeholder="팀 이름을 입력하세요"
              onChange={(e) => {
                setName(e.target.value);
                change();
              }}
            />
          </label>
        </section>
        <section className="card survey-question">
          <div className="field">
            PDF 발표자료 <span className="required">*</span>
          </div>
          <p className="help">PDF · 최대 20MB · 500페이지 · 암호 없는 파일</p>
          <div
            className="survey-upload"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) {
                setFile(e.dataTransfer.files[0] ?? null);
                change();
              }
            }}
          >
            <input
              ref={input}
              type="file"
              tabIndex={-1}
              accept="application/pdf,.pdf"
              aria-label="발표 PDF 선택"
              disabled={busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                change();
              }}
            />
            {file ? <FileText size={26} /> : <UploadCloud size={28} />}
            <div>
              <strong>{file?.name ?? "발표자료를 여기에 놓아주세요"}</strong>
              <small>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(2)}MB`
                  : "또는 아래 버튼으로 파일을 선택하세요"}
              </small>
            </div>
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {file ? "파일 변경" : "파일 선택"}
            </button>
          </div>
        </section>
        <section className="card survey-question">
          <label className="field" htmlFor="survey-leader">
            팀장 <span className="required">*</span>
            <input
              id="survey-leader"
              required
              maxLength={80}
              disabled={busy}
              value={leader}
              placeholder="팀장 이름"
              onChange={(e) => {
                setLeader(e.target.value);
                change();
              }}
            />
          </label>
        </section>
        <section className="card survey-question">
          <label className="field" htmlFor="survey-members">
            팀원
            <textarea
              id="survey-members"
              rows={4}
              maxLength={2430}
              disabled={busy}
              value={members}
              placeholder={
                "팀장 외 팀원을 한 줄에 한 명씩 입력하세요.\n1인 팀은 비워 두어도 됩니다."
              }
              onChange={(e) => {
                setMembers(e.target.value);
                change();
              }}
            />
          </label>
          <p className="help">최대 30명 · 이름당 80자</p>
        </section>
        {busy && (
          <section className="card survey-progress" role="status">
            <progress value={progress} max="100" aria-label="제출 진행률" />
            <p>
              {progress === 0
                ? "PDF 파일을 확인하고 있습니다…"
                : `제출 중 ${progress}%`}
            </p>
          </section>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            {attempt.current && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  await refresh();
                  attempt.current = null;
                  setError("최신 상태를 확인했습니다. 다시 제출해 주세요.");
                }}
              >
                최신 상태 확인
              </button>
            )}
          </div>
        )}
        <div className="survey-submit">
          <span>제출한 정보는 행사 운영에 사용됩니다.</span>
          <button className="btn primary" disabled={busy}>
            {busy ? "제출 중…" : error ? "다시 제출" : "제출하기"}
            <ArrowRight size={17} />
          </button>
        </div>
        <footer>큐 · 좋은 발표에 집중하세요.</footer>
      </form>
    </main>
  );
}
