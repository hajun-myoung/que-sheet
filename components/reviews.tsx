"use client";
import { useConfirm } from "./confirm";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  FilePenLine,
  LockKeyhole,
  Save,
  Send,
  RefreshCw,
} from "lucide-react";
import { request, message } from "@/lib/client";
import {
  validateScores,
  type Snapshot,
  type Team,
  type Command,
} from "@/lib/model";
import { formatResultScore, groupTeamResults } from "@/lib/results";
import Footer from "./footer";
export function ReviewForm({
  data,
  team,
  mutate,
  onDirty,
}: {
  data: Snapshot;
  team: Team;
  mutate: (c: Command) => Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const confirm = useConfirm();
  const ev = data.evaluations.find(
    (e) => e.team_id === team.id && e.judge_id === data.me.user_id,
  );
  const rubric = data.rubrics.find(
    (r) => r.id === (ev?.rubric_id ?? data.event.current_rubric_id),
  )!;
  const [scores, setScores] = useState<Record<string, number>>(
      ev?.scores ?? {},
    ),
    [notes, setNotes] = useState(ev?.notes ?? ""),
    [base, setBase] = useState(ev?.version ?? 0),
    [dirty, setDirty] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const failed = useRef<Command | null>(null);
  const locked = ev?.status === "submitted";
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) {
      setScores(ev?.scores ?? {});
      setNotes(ev?.notes ?? "");
      setBase(ev?.version ?? 0);
    }
  }, [ev?.version, dirty]);
  async function save(final = false, retry = false) {
    if (busy) return;
    setError("");
    try {
      validateScores(scores, rubric, final);
    } catch (e) {
      setError(message(e));
      return;
    }
    if (
      final &&
      !retry &&
      !(await confirm(
        "최종 제출 후에는 운영자가 재작성을 허용할 때까지 수정할 수 없습니다. 제출할까요?",
      ))
    )
      return;
    const cmd =
      retry && failed.current
        ? failed.current
        : request("review", data.event.id, {
            team_id: team.id,
            version: base,
            rubric_id: rubric.id,
            scores,
            notes,
            final,
          });
    setBusy(true);
    setStatus("저장 중…");
    try {
      await mutate(cmd);
      failed.current = null;
      setDirty(false);
      setStatus(final ? "최종 제출 완료" : "저장 완료");
    } catch (e) {
      failed.current = cmd;
      setError(message(e));
      setStatus("저장 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card review-form" data-guide="review">
      <div className="section-title">
        <div>
          <span className="eyebrow">EVALUATION</span>
          <h2>{team.name} 평가</h2>
        </div>
        <span className={`badge ${locked ? "success" : ""}`}>
          {locked ? <LockKeyhole size={13} /> : <FilePenLine size={13} />}{" "}
          {locked ? "최종 제출" : "작성 중"} · 기준 v{rubric.version}
        </span>
      </div>
      <p className="muted">{team.description}</p>
      {!ev && (
        <div className="notice">
          <ClipboardCheck size={20} />
          <div>
            <strong>심사를 시작하면 평가 기준이 고정됩니다.</strong>
            <p>
              작성 중 기준이 변경되어도 이 평가에는 v{rubric.version}이
              적용됩니다.
            </p>
          </div>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void save()}
          >
            심사 시작
          </button>
        </div>
      )}
      <div data-guide="scores">
        <div className="criterion-list">
          {rubric.items.map((item, i) => (
            <div className="criterion" key={item.id}>
              <span className="criterion-number">0{i + 1}</span>
              <div className="grow">
                <label htmlFor={`score-${item.id}`}>
                  {item.name}
                  <span className="required"> *</span>
                </label>
                <p>{item.description}</p>
              </div>
              <div className="score-input">
                <input
                  id={`score-${item.id}`}
                  aria-label={`${item.name} 점수`}
                  type="number"
                  min="0"
                  max={item.max}
                  step="0.1"
                  disabled={!ev || locked || busy}
                  value={scores[item.id] ?? ""}
                  placeholder="—"
                  onChange={(e) => {
                    const next = { ...scores };
                    if (e.target.value === "") delete next[item.id];
                    else next[item.id] = Number(e.target.value);
                    setScores(next);
                    setDirty(true);
                    setStatus("저장되지 않은 변경");
                  }}
                />
                <span>/ {item.max}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="score-total">
          <span>
            합계 점수<small>{rubric.items.length}개 평가 항목</small>
          </span>
          <strong>
            {Object.values(scores)
              .reduce((a, b) => a + b, 0)
              .toFixed(1)}{" "}
            <small>/ {rubric.items.reduce((a, i) => a + i.max, 0)}</small>
          </strong>
        </div>
        <label className="field">
          비고 및 심사 의견
          <textarea
            maxLength={5000}
            rows={4}
            disabled={!ev || locked || busy}
            placeholder="팀에게 전달하고 싶은 피드백이나 평가 의견을 남겨 주세요."
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setDirty(true);
              setStatus("저장되지 않은 변경");
            }}
          />
          <small>{notes.length.toLocaleString()} / 5,000</small>
        </label>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <div className="button-row">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() =>
                void save(Boolean(failed.current?.payload.final), true)
              }
            >
              <RefreshCw size={14} />
              같은 요청 재시도
            </button>
            <button
              className="btn secondary"
              onClick={async () => {
                if (
                  await confirm(
                    "저장하지 않은 내용을 버리고 서버의 최신 평가를 불러올까요?",
                  )
                ) {
                  setDirty(false);
                  setBase(ev?.version ?? 0);
                  setScores(ev?.scores ?? {});
                  setNotes(ev?.notes ?? "");
                  setError("");
                  setStatus("최신 내용 불러옴");
                }
              }}
            >
              최신 내용 불러오기
            </button>
          </div>
        </div>
      )}
      <div className="form-footer" data-guide="review-save">
        <span className="save-status" role="status">
          {status === "저장 완료" || locked ? <CheckCircle2 size={16} /> : null}
          {locked
            ? "최종 제출 완료 · 읽기 전용"
            : status || "점수와 비고를 입력해 주세요."}
        </span>
        {!locked && ev && (
          <div className="button-row">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => void save()}
            >
              <Save size={16} />
              임시저장
            </button>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => void save(true)}
            >
              <Send size={16} />
              최종 제출
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
export function Results({
  data,
  run,
}: {
  data: Snapshot;
  run: (kind: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const confirm = useConfirm();
  const submitted = data.evaluations.filter((e) => e.status === "submitted");
  const groups = groupTeamResults(data);
  return (
    <div className="results" data-guide="results">
      <div className="page-heading">
        <div>
          <span className="eyebrow">JUDGING OVERVIEW</span>
          <h1>심사 현황</h1>
          <p>팀별 심사 진행 상황과 최종 제출된 평가를 확인하세요.</p>
        </div>
        <span className="badge success">
          <CheckCircle2 size={14} />
          {submitted.length}건 최종 제출
        </span>
      </div>
      <div className="card table-card">
        <table className="team-results">
          <thead>
            <tr>
              <th>팀</th>
              <th>심사위원</th>
              <th>기준</th>
              <th>상태</th>
              <th>합계</th>
              <th>관리</th>
            </tr>
          </thead>
          {groups.map(({ team, reviews, submittedCount, averages }) => {
            const multiple = reviews.length > 1;
            const teamCell = (
              <th
                scope="rowgroup"
                rowSpan={multiple ? reviews.length + 1 : 1}
                className="team-result-name"
              >
                <strong>{team.name}</strong>
              </th>
            );
            return (
              <tbody key={team.id} aria-label={`${team.name} 심사 결과`}>
                {!reviews.length && (
                  <tr>
                    {teamCell}
                    <td colSpan={5}>
                      <span className="badge">◷ 심사위원 미배정</span>
                    </td>
                  </tr>
                )}
                {multiple && (
                  <tr className="team-average-row">
                    {teamCell}
                    <td>
                      <strong>평균</strong>
                      <small className="result-caption">
                        심사위원 {reviews.length}명
                      </small>
                    </td>
                    <td>
                      {averages.length > 1
                        ? "버전별"
                        : averages.length === 1
                          ? `v${averages[0].rubric.version}`
                          : "—"}
                    </td>
                    <td>
                      <span
                        className={`badge ${submittedCount === reviews.length ? "success" : "amber"}`}
                      >
                        {submittedCount === reviews.length ? "✓" : "◷"}{" "}
                        {submittedCount}/{reviews.length}명 제출
                      </span>
                    </td>
                    <td>
                      {averages.length
                        ? averages.map((a) => (
                            <div className="average-version" key={a.rubric.id}>
                              <strong>
                                {formatResultScore(a.score)} /{" "}
                                {formatResultScore(a.max)}
                              </strong>
                              <small className="result-caption">
                                {a.count}명 평균
                                {averages.length > 1
                                  ? ` · 기준 v${a.rubric.version}`
                                  : ""}
                              </small>
                            </div>
                          ))
                        : "—"}
                    </td>
                    <td>—</td>
                  </tr>
                )}
                {reviews.map(
                  ({ judgeId, judge, evaluation: ev, rubric: r }) => (
                    <tr
                      key={judgeId}
                      className={multiple ? "team-review-row" : ""}
                    >
                      {!multiple && teamCell}
                      <td>
                        {multiple && (
                          <span className="review-indent" aria-hidden="true">
                            ↳
                          </span>
                        )}
                        {judge?.display_name ?? "심사위원"}
                      </td>
                      <td>{r ? `v${r.version}` : "—"}</td>
                      <td>
                        <span
                          className={`badge ${ev?.status === "submitted" ? "success" : ev ? "amber" : ""}`}
                        >
                          {ev?.status === "submitted"
                            ? "✓ 최종 제출"
                            : ev
                              ? "✎ 임시저장"
                              : "◷ 미작성"}
                        </span>
                      </td>
                      <td>
                        {ev?.status === "submitted" && r
                          ? `${formatResultScore(Object.values(ev.scores).reduce((a, b) => a + b, 0))} / ${formatResultScore(r.items.reduce((a, i) => a + i.max, 0))}`
                          : "—"}
                      </td>
                      <td>
                        {ev?.status === "submitted" && (
                          <button
                            className="text-button"
                            onClick={async () => {
                              if (
                                await confirm(
                                  "이 평가를 다시 작성할 수 있도록 열까요? 기존 점수와 기준 버전은 유지됩니다.",
                                )
                              )
                                void run("reopen", { evaluation_id: ev.id });
                            }}
                          >
                            재작성 허용
                          </button>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            );
          })}
        </table>
        {!data.teams.length && (
          <div className="empty-state">
            설정에서 심사위원에게 팀을 배정해 주세요.
          </div>
        )}
      </div>
      <div className="feedback-grid">
        {submitted.map((ev) => {
          const t = data.teams.find((t) => t.id === ev.team_id),
            r = data.rubrics.find((r) => r.id === ev.rubric_id)!;
          return (
            <section className="card feedback-card" key={ev.id}>
              <div className="section-title">
                <h3>{t?.name}</h3>
                <span className="badge">기준 v{r.version}</span>
              </div>
              <p className="muted">
                {
                  data.members.find((m) => m.user_id === ev.judge_id)
                    ?.display_name
                }
                의 평가
              </p>
              <div className="result-scores">
                {r.items.map((i) => (
                  <div key={i.id}>
                    <span>{i.name}</span>
                    <strong>
                      {ev.scores[i.id]} <small>/ {i.max}</small>
                    </strong>
                  </div>
                ))}
              </div>
              <p className="feedback-notes">
                {ev.notes || "작성된 비고가 없습니다."}
              </p>
            </section>
          );
        })}
      </div>
      <p className="help">
        평균은 현재 배정된 심사위원의 최종 제출 점수만 포함하며 소수점 둘째
        자리까지 표시합니다. 미작성·임시저장 점수는 제외하고, 평가 기준 버전이
        다르면 버전별 평균을 표시합니다.
      </p>
      <Footer />
    </div>
  );
}
