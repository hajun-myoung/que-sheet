"use client";
import { GeneralSettings } from "./general-settings";
import { ParticipantCodes } from "./participant-codes";
import { useEffect, useState } from "react";
import {
  Check,
  Clock3,
  Copy,
  Mail,
  Palette,
  Plus,
  Save,
  Trash2,
  Users,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  defaults,
  timerView,
  uuid,
  validateSettings,
  type Snapshot,
  type Criterion,
  type Role,
} from "@/lib/model";
import Footer from "./footer";
export function SettingsPanel({
  data,
  guideTab,
  run,
  refresh,
  openEvent,
}: {
  data: Snapshot;
  guideTab?: string;
  openEvent: (id: string) => void;
  refresh: () => Promise<void>;
  run: (kind: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [tab, setTab] = useState("timer"),
    [settings, setSettings] = useState({ ...data.event.settings }),
    [preview, setPreview] = useState(0),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (guideTab) setTab(guideTab);
  }, [guideTab]);
  const current = data.rubrics.find(
    (r) => r.id === data.event.current_rubric_id,
  )!;
  const [items, setItems] = useState<Criterion[]>(
    structuredClone(current.items),
  );
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [email, setEmail] = useState(""),
    [inviteName, setInviteName] = useState(""),
    [inviteRole, setInviteRole] = useState<Role>("judge"),
    [inviteTeam, setInviteTeam] = useState(data.teams[0]?.id ?? "");
  async function save(kind: string, payload: Record<string, unknown>) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (kind === "settings") validateSettings(settings);
      await run(kind, payload);
      setNotice("저장되었습니다.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  const timer = timerView(
    preview === 0
      ? settings.duration_seconds * 1000
      : preview === 1
        ? settings.warning_seconds * 1000
        : -65000,
    settings,
  );
  return (
    <div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVENT SETTINGS</span>
          <h1>행사 설정</h1>
          <p>발표 시간부터 심사 기준까지, 행사에 맞게 준비하세요.</p>
        </div>
      </div>
      <div className="tabs" role="group" aria-label="설정 항목">
        {[
          ["general", "일반 및 운영"],
          ["timer", "타이머"],
          ["teams", "팀 · 심사위원"],
          ["rubric", "평가 기준"],
        ].map(([id, label]) => (
          <button
            data-guide={`settings-tab-${id}`}
            key={id}
            aria-pressed={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setNotice("");
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "general" && (
        <GeneralSettings
          data={data}
          run={run}
          refresh={refresh}
          openEvent={openEvent}
        />
      )}
      {tab === "timer" && (
        <div className="settings-grid">
          <section className="card settings-card" data-guide="timer-settings">
            <div className="section-title">
              <h2>
                <Clock3 size={20} />
                발표 시간
              </h2>
            </div>
            <div className="form-grid">
              <label className="field">
                기본 발표 시간 (초)
                <input
                  type="number"
                  min="10"
                  max="7200"
                  value={settings.duration_seconds}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      duration_seconds: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="field">
                종료 임박 기준 (초)
                <input
                  type="number"
                  min="0"
                  max={settings.duration_seconds}
                  value={settings.warning_seconds}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      warning_seconds: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <p className="help">
              팀별 시간이 설정되어 있으면 기본 시간보다 우선 적용됩니다.
            </p>
            <hr />
            <h3 className="icon-heading">
              <Palette size={18} />
              상태별 타이머 색상
            </h3>
            {(["normal", "warning", "overtime"] as const).map((key, i) => (
              <label className="color-field" key={key}>
                <span>{["● 정상", "◷ 종료 임박", "! 시간 초과"][i]}</span>
                <div>
                  <input
                    aria-label={`${key} 색상`}
                    type="color"
                    value={settings[`${key}_color`]}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        [`${key}_color`]: e.target.value.toUpperCase(),
                      })
                    }
                  />
                  <code>{settings[`${key}_color`]}</code>
                </div>
              </label>
            ))}
            <p className="help">
              타이머 배경 대비 4.5:1 이상인 색상만 저장할 수 있습니다.
            </p>
            <div className="form-footer">
              <button
                className="text-button"
                onClick={() => setSettings({ ...defaults })}
              >
                기본값 복원
              </button>
              <button
                className="btn primary"
                disabled={saving}
                onClick={() => void save("settings", { settings })}
              >
                <Save size={16} />
                설정 저장
              </button>
            </div>
          </section>
          <section className="card settings-card">
            <h2>타이머 미리보기</h2>
            <p className="muted">발표 화면 하단에 이렇게 표시됩니다.</p>
            <div className="timer-preview" style={{ color: timer.color }}>
              <span>{timer.label}</span>
              <strong>{timer.text}</strong>
            </div>
            <div className="segmented">
              {["정상", "종료 임박", "시간 초과"].map((label, i) => (
                <button
                  key={label}
                  className={preview === i ? "active" : ""}
                  onClick={() => setPreview(i)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="notice compact">
              <Clock3 size={18} />
              <p>
                변경한 시간과 색상은 <strong>다음 발표부터</strong> 적용됩니다.
                진행 중인 타이머는 유지됩니다.
              </p>
            </div>
          </section>
        </div>
      )}
      {tab === "teams" && (
        <div className="settings-grid">
          <ParticipantCodes data={data} refresh={refresh} run={run} />
          <section className="card settings-card" data-guide="team-settings">
            <h2>팀 등록</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save("team", {
                  id: uuid(),
                  name,
                  description,
                  duration_seconds: null,
                }).then((saved) => {
                  if (saved) {
                    setName("");
                    setDescription("");
                  }
                });
              }}
            >
              <label className="field">
                팀 이름
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="새로운 팀 이름"
                />
              </label>
              <label className="field">
                팀 소개
                <input
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="프로젝트를 한 줄로 소개해 주세요"
                />
              </label>
              <button className="btn primary" disabled={saving}>
                <Plus size={16} />팀 등록
              </button>
            </form>
            <hr />
            <h3>팀별 발표 시간</h3>
            {[...data.teams]
              .sort((a, b) => a.sort_index - b.sort_index)
              .map((t) => (
                <div className="team-duration" key={t.id}>
                  <span>{t.name}</span>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void save("team", {
                        team_id: t.id,
                        name: t.name,
                        description: t.description,
                        duration_seconds: f.get("seconds")
                          ? Number(f.get("seconds"))
                          : null,
                      });
                    }}
                  >
                    <input
                      aria-label={`${t.name} 발표 시간 (초)`}
                      name="seconds"
                      type="number"
                      min="10"
                      max="7200"
                      placeholder={`기본 ${data.event.settings.duration_seconds}초`}
                      defaultValue={t.duration_seconds ?? ""}
                      key={`${t.id}-${t.duration_seconds}`}
                    />
                    <button
                      className="icon-btn"
                      aria-label={`${t.name} 시간 저장`}
                      disabled={saving}
                    >
                      <Check size={16} />
                    </button>
                  </form>
                </div>
              ))}
          </section>
          <section
            className="card settings-card member-invite"
            data-guide="judge-settings"
          >
            <h2>
              <Mail size={20} />
              멤버 초대
            </h2>
            <p className="help">
              초대 링크를 직접 전달하거나 멤버만 등록한 뒤 참여 코드 발급의 일괄
              초대를 사용하세요. 등록만으로 계정이나 행사 권한이 생성되지는
              않습니다.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save("invite", {
                  id: uuid(),
                  email,
                  display_name: inviteName,
                  role: inviteRole,
                  registered_only:
                    (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                      "value",
                    ) === "register",
                  ...(inviteRole === "participant"
                    ? { team_id: inviteTeam }
                    : {}),
                });
              }}
            >
              <div className="form-grid">
                <label className="field">
                  이름
                  <input
                    required
                    maxLength={80}
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                </label>
                <label className="field">
                  역할
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                  >
                    <option value="judge">심사위원</option>
                    <option value="participant">참여자</option>
                    <option value="operator">운영자</option>
                  </select>
                </label>
              </div>
              <label className="field">
                이메일
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </label>
              {inviteRole === "participant" && (
                <label className="field">
                  소속 팀
                  <select
                    required
                    value={inviteTeam}
                    onChange={(e) => setInviteTeam(e.target.value)}
                  >
                    <option value="">팀 선택</option>
                    {data.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="button-row">
                <button className="btn primary" disabled={saving} value="link">
                  <Plus size={16} />
                  초대 링크 만들기
                </button>
                <button
                  className="btn secondary"
                  disabled={saving}
                  value="register"
                >
                  멤버만 등록하기
                </button>
              </div>
            </form>
            <div className="invite-list">
              {data.invitations.map((i) => (
                <div key={i.id}>
                  <div>
                    <strong>{i.display_name}</strong>
                    <small>
                      {i.email} ·{" "}
                      {i.accepted
                        ? "참여 완료"
                        : i.registered_only
                          ? "멤버 등록"
                          : "초대 대기"}
                    </small>
                  </div>
                  {!i.accepted && !i.registered_only && (
                    <button
                      className="icon-btn"
                      aria-label={`${i.display_name} 초대 링크 복사`}
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(
                            `${location.origin}/?role=${i.role}&invite=${i.id}`,
                          )
                          .then(() => setNotice("초대 링크를 복사했습니다."))
                          .catch(() =>
                            setError(
                              "클립보드에 접근할 수 없습니다. 초대 ID: " + i.id,
                            ),
                          );
                      }}
                    >
                      <Copy size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <hr />
            <h3>심사위원별 팀 배정</h3>
            {data.members
              .filter((m) => m.role === "judge")
              .map((m) => (
                <fieldset className="assignments" key={m.user_id}>
                  <legend>{m.display_name}</legend>
                  {data.teams.map((t) => (
                    <label key={t.id}>
                      <input
                        type="checkbox"
                        disabled={saving}
                        checked={data.assignments.some(
                          (a) => a.team_id === t.id && a.judge_id === m.user_id,
                        )}
                        onChange={(e) =>
                          void save("assign", {
                            team_id: t.id,
                            judge_id: m.user_id,
                            assigned: e.target.checked,
                          })
                        }
                      />
                      {t.name}
                    </label>
                  ))}
                </fieldset>
              ))}
            {!data.members.some((m) => m.role === "judge") && (
              <p className="help">
                심사위원이 초대를 수락하면 팀을 배정할 수 있습니다.
              </p>
            )}
          </section>
        </div>
      )}
      {tab === "rubric" && (
        <section
          className="card settings-card rubric-editor"
          data-guide="rubric-settings"
        >
          <div className="section-title">
            <div>
              <h2>평가 기준</h2>
              <p className="muted">
                현재 v{current.version} · 저장하면 새로운 버전이 생성됩니다.
              </p>
            </div>
            <span className="badge">
              총 {items.reduce((a, i) => a + i.max, 0)}점
            </span>
          </div>
          <div className="notice compact">
            <LockIcon />
            <p>
              기존 심사에는 작성 시작 시점의 기준이 유지됩니다. 변경된 항목은 새
              심사부터 적용됩니다.
            </p>
          </div>
          {items.map((item, i) => (
            <div className="rubric-item" key={item.id}>
              <span className="criterion-number">{i + 1}</span>
              <div>
                <label className="field">
                  항목명
                  <input
                    maxLength={80}
                    value={item.name}
                    onChange={(e) =>
                      setItems(
                        items.map((x) =>
                          x.id === item.id ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label className="field">
                  설명
                  <input
                    value={item.description}
                    onChange={(e) =>
                      setItems(
                        items.map((x) =>
                          x.id === item.id
                            ? { ...x, description: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <label className="field max-field">
                배점
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={item.max}
                  onChange={(e) =>
                    setItems(
                      items.map((x) =>
                        x.id === item.id
                          ? { ...x, max: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <div className="vertical-actions">
                <button
                  className="icon-btn"
                  aria-label={`${item.name} 위로`}
                  disabled={i === 0}
                  onClick={() => {
                    const a = [...items];
                    [a[i - 1], a[i]] = [a[i], a[i - 1]];
                    setItems(a);
                  }}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`${item.name} 아래로`}
                  disabled={i === items.length - 1}
                  onClick={() => {
                    const a = [...items];
                    [a[i + 1], a[i]] = [a[i], a[i + 1]];
                    setItems(a);
                  }}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`${item.name} 삭제`}
                  disabled={items.length <= 1}
                  onClick={() =>
                    setItems(items.filter((x) => x.id !== item.id))
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          <div className="form-footer">
            <button
              className="btn secondary"
              disabled={items.length >= 20}
              onClick={() =>
                setItems([
                  ...items,
                  { id: uuid(), name: "", description: "", max: 10 },
                ])
              }
            >
              <Plus size={16} />
              평가 항목 추가
            </button>
            <button
              className="btn primary"
              disabled={saving}
              onClick={() => void save("rubric", { id: uuid(), items })}
            >
              <Save size={16} />새 버전으로 저장
            </button>
          </div>
        </section>
      )}
      {error && (
        <div className="error settings-message" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      <Footer />
    </div>
  );
}
function LockIcon() {
  return <Save size={18} />;
}
