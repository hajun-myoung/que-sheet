"use client";
import { useRef, useState } from "react";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  RefreshCw,
  X,
} from "lucide-react";
import { uploadPdf, message } from "@/lib/client";
import { uuid, type Snapshot, type Team, type Command } from "@/lib/model";
export function Upload({
  data,
  team,
  mutate,
  refresh,
}: {
  data: Snapshot;
  team: Team;
  mutate: (c: Command) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [progress, setProgress] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    attempt = useRef<{ id: string; data: Snapshot; createdAt: string } | null>(
      null,
    );
  const choose = (f?: File) => {
    if (!f || busy) return;
    setFile(f);
    setError("");
    setDone(false);
    setProgress(0);
    attempt.current = null;
  };
  async function submit() {
    if (!file || busy) return;
    attempt.current ??= {
      id: uuid(),
      data,
      createdAt: new Date().toISOString(),
    };
    setBusy(true);
    setError("");
    try {
      await uploadPdf(
        file,
        team.id,
        attempt.current.data,
        setProgress,
        mutate,
        attempt.current.id,
        attempt.current.createdAt,
      );
      await refresh();
      setDone(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="upload-section">
      <div className="section-title">
        <h3>{team.submission_id ? "발표자료 교체" : "발표자료 제출"}</h3>
        <span className="muted small">PDF · 최대 20MB · 500페이지</span>
      </div>
      <div
        className={`dropzone ${busy ? "uploading" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(e.dataTransfer.files[0]);
        }}
      >
        <input
          ref={input}
          type="file"
          tabIndex={-1}
          accept="application/pdf,.pdf"
          aria-label="발표 PDF 선택"
          disabled={busy}
          onChange={(e) => choose(e.target.files?.[0])}
        />
        {done ? (
          <CheckCircle2 size={28} />
        ) : file ? (
          <FileText size={28} />
        ) : (
          <UploadCloud size={28} />
        )}
        <div>
          <strong>
            {done
              ? "발표자료가 안전하게 제출되었습니다"
              : (file?.name ?? "PDF 파일을 여기에 놓아주세요")}
          </strong>
          <p>
            {file
              ? `${(file.size / 1024 / 1024).toFixed(2)}MB`
              : "또는 클릭해서 파일을 선택하세요"}
          </p>
        </div>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {file ? "다른 파일" : "파일 선택"}
        </button>
      </div>
      {busy && (
        <div>
          <progress value={progress} max="100" aria-label="업로드 진행률" />
          <p className="help" role="status">
            {progress === 0
              ? "PDF 유효성 검사 중…"
              : progress < 95
                ? `업로드 중 ${progress}%`
                : "서버에서 확인하고 제출본을 저장하는 중…"}
          </p>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="upload-footer">
        <p className="help">
          새 파일 확인이 완료된 뒤 교체됩니다. 진행 중인 발표에는 기존 자료가
          유지됩니다.
        </p>
        {file && !done && (
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            {error ? <RefreshCw size={16} /> : <UploadCloud size={16} />}{" "}
            {busy ? "제출 중…" : error ? "재시도" : "제출하기"}
          </button>
        )}
      </div>
      {error && (
        <button
          className="text-button"
          onClick={() => {
            attempt.current = null;
            setError(
              "최신 제출본을 확인했습니다. 다시 제출하기를 눌러 주세요.",
            );
          }}
        >
          충돌한 경우 최신 제출본 기준으로 새로 제출
        </button>
      )}
    </section>
  );
}
