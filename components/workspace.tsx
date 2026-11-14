"use client";
import { HelpGuide } from "./help";
import { testMode, homeHref } from "@/lib/test-workspace";
import { useConfirm } from "./confirm";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  LayoutDashboard,
  LogOut,
  Maximize,
  MonitorPlay,
  MoreHorizontal,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  Wifi,
  WifiOff,
  ClipboardCheck,
  ExternalLink,
  Mail,
} from "lucide-react";
import {
  configured,
  supabase,
  useWorkspace,
  request,
  message,
  pdfUrl,
} from "@/lib/client";
import {
  activeSession,
  durationLabel,
  roleLabel,
  uuid,
  type Command,
  type Role,
  type Snapshot,
  type Team,
} from "@/lib/model";
import { PdfEmpty, PdfViewer } from "./pdf-viewer";
import { Presenter } from "./presenter";
import { Upload } from "./upload";
import { ReviewForm, Results } from "./reviews";
import { AccountPopover } from "./account-popover";
import { EventActions, PendingDeletions } from "./event-actions";
import { AccessScreen } from "./access-screen";
import { ParticipantForm } from "./participant-form";
import { Practice } from "./practice";
import { SettingsPanel } from "./settings";
import Footer from "./footer";
export function Workspace() {
  const confirm = useConfirm();
  const store = useWorkspace(),
    { data, mutate } = store;
  const [guideTab, setGuideTab] = useState("timer");
  const [view, setView] = useState("dashboard"),
    [codeEntry, setCodeEntry] = useState(false),
    [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [previewPage, setPreviewPage] = useState(1),
    [presenting, setPresenting] = useState(false),
    [practicing, setPracticing] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [actionError, setActionError] = useState(""),
    [dirty, setDirty] = useState(false),
    [inviteId, setInviteId] = useState("");
  const host = useRef<HTMLDivElement>(null),
    failed = useRef<Command | null>(null),
    busyRef = useRef(false);
  const team = data?.teams.find((t) => t.id === selected) ?? data?.teams[0],
    session = data ? activeSession(data) : undefined,
    pdf = data?.submissions.find((s) => s.id === team?.submission_id);
  useEffect(() => {
    setView("dashboard");
    setSelected("");
    setSearch("");
    setPresenting(false);
    setPracticing(false);
    setDirty(false);
    setActionError("");
    failed.current = null;
  }, [data?.me.user_id, data?.me.role, data?.me.team_id, data?.event.id]);
  useEffect(() => {
    setPreviewPage(1);
  }, [team?.id, pdf?.id]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    setInviteId(new URLSearchParams(location.search).get("invite") ?? "");
    setCodeEntry(new URLSearchParams(location.hash.slice(1)).has("code"));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  const navigate = async (fn: () => void) => {
    if (
      !dirty ||
      (await confirm("저장되지 않은 평가가 있습니다. 이동할까요?"))
    ) {
      setDirty(false);
      fn();
    }
  };
  const run = useCallback(
    async (kind: string, payload: Record<string, unknown>) => {
      if (!data) return;
      const cmd = request(kind, data.event.id, payload);
      try {
        await mutate(cmd);
      } catch (e) {
        throw e;
      }
    },
    [data, mutate],
  );
  async function act(
    kind: string,
    payload: Record<string, unknown>,
    retry = false,
  ) {
    if (!data || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError("");
    const cmd =
      retry && failed.current
        ? failed.current
        : request(kind, data.event.id, payload);
    try {
      await mutate(cmd);
      failed.current = null;
    } catch (e) {
      failed.current = cmd;
      setActionError(message(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const openPresenter = () => {
    flushSync(() => setPresenting(true));
    if (host.current?.requestFullscreen)
      void host.current
        .requestFullscreen()
        .catch(() =>
          setNotice(
            "전체화면 진입을 허용해 주세요. 발표 화면에서 다시 시도할 수 있습니다.",
          ),
        );
    else setNotice("전체화면 미지원 브라우저입니다. 창을 최대화해 주세요.");
  };
  const closePresenter = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    setPresenting(false);
  };
  async function start() {
    if (!team || busy || session) return;
    openPresenter();
    await act("start", { team_id: team.id, id: uuid() });
  }
  if (!store.authReady)
    return (
      <div className="loading-screen">
        <div className="brand-mark">q</div>
        <p>접속 상태를 확인하고 있습니다…</p>
      </div>
    );
  if (!data || codeEntry)
    return (
      <AccessScreen
        login={async (role, code) => {
          await store.login(role, code);
          setCodeEntry(false);
        }}
        refresh={store.refresh}
        accountEmail={store.accountEmail}
        events={store.events}
        setEventId={(id) => {
          store.setEventId(id);
          setCodeEntry(false);
        }}
        loadError={store.error}
        logout={store.logout}
        recovery={
          <PendingDeletions
            events={store.pendingDeletions}
            refresh={store.refresh}
          />
        }
      />
    );
  if (data.me.role === "participant" && team && !team.submission_id)
    return (
      <ParticipantForm
        key={team.id}
        data={data}
        team={team}
        mutate={mutate}
        refresh={store.refresh}
        logout={store.logout}
      />
    );
  const operator = data.me.role === "operator",
    judge = data.me.role === "judge";
  const teams = [...data.teams]
    .sort((a, b) => a.sort_index - b.sort_index)
    .filter((t) =>
      `${t.name} ${t.description}`.toLowerCase().includes(search.toLowerCase()),
    );
  const submitted = data.teams.filter((t) => t.submission_id).length,
    completed = new Set(
      data.sessions.filter((s) => s.status === "ended").map((s) => s.team_id),
    ).size;
  return (
    <div className="app-shell">
      <aside className="app-nav" inert={presenting || practicing}>
        <a className="brand" href={homeHref} aria-label="큐 홈">
          <span className="brand-mark">
            q<span>•</span>
          </span>
          <div>
            큐:시트<span>매끄러운 발표를 한 곳에서</span>
          </div>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="event-switch">
          <span className="event-avatar">I</span>
          <div>
            {data.event.name}
            <small>행사 관리 공간</small>
          </div>
        </div>
        <nav aria-label="주요 메뉴">
          <span className="nav-label">행사 관리</span>
          <button
            className={view === "dashboard" ? "active" : ""}
            onClick={() => navigate(() => setView("dashboard"))}
          >
            <LayoutDashboard size={19} />
            {operator ? "발표 운영" : judge ? "팀별 심사" : "나의 발표"}
          </button>
          {operator && (
            <>
              <button
                className={view === "results" ? "active" : ""}
                onClick={() => navigate(() => setView("results"))}
              >
                <ClipboardCheck size={19} />
                심사 현황
                <span className="nav-count">
                  {
                    data.evaluations.filter((e) => e.status === "submitted")
                      .length
                  }
                </span>
              </button>
              <button
                data-guide="settings-nav"
                className={view === "settings" ? "active" : ""}
                onClick={() => navigate(() => setView("settings"))}
              >
                <Settings2 size={19} />
                행사 설정
              </button>
            </>
          )}
        </nav>
        <div className="nav-bottom">
          <div className="support-card">
            <ShieldCheck size={22} />
            <strong>안정적인 진행을 위한 준비</strong>
            <p>
              발표 전 자료와 타이머를
              <br />
              미리 확인해 주세요.
            </p>
            <span>
              함께 만드는 좋은 발표 <ArrowRight size={14} />
            </span>
          </div>
          <div className="nav-user">
            <span className="avatar">{data.me.display_name[0]}</span>
            <div>
              <strong title={data.me.display_name}>
                {data.me.display_name}
              </strong>
              <small>{roleLabel[data.me.role]}</small>
            </div>
            {
              <button
                aria-label="로그아웃"
                className="icon-btn"
                onClick={() =>
                  navigate(() => {
                    void store.logout();
                  })
                }
              >
                <LogOut size={16} />
              </button>
            }
          </div>
        </div>
      </aside>
      <div className="main-shell" inert={presenting || practicing}>
        <header className="topbar">
          <div className="breadcrumbs">
            행사 관리 <ChevronRight size={13} />
            <strong>
              {view === "dashboard"
                ? "발표 운영"
                : view === "results"
                  ? "심사 현황"
                  : "행사 설정"}
            </strong>
          </div>
          <div className="topbar-actions">
            <HelpGuide
              role={data.me.role}
              prepare={(step) => {
                if (step.view) setView(step.view);
                if (step.tab) setGuideTab(step.tab);
              }}
            />
            <span
              className={`connection ${store.connection !== "online" ? "offline" : ""}`}
            >
              {store.connection === "online" ? (
                <Wifi size={14} />
              ) : (
                <WifiOff size={14} />
              )}{" "}
              {store.connection === "online"
                ? configured
                  ? "실시간 연결"
                  : "로컬 동기화"
                : "재연결 중"}
            </span>
            {!configured && (
              <div className="demo-switch">
                <span>TEST</span>
                <button
                  className="text-button"
                  onClick={() =>
                    navigate(() => {
                      void store.logout();
                    })
                  }
                >
                  역할 전환 · 로그인
                </button>
              </div>
            )}
            {configured && operator && (
              <EventActions
                data={data}
                openEvent={store.setEventId}
                refresh={store.refresh}
              />
            )}
            <AccountPopover
              key={data.event.id}
              data={data}
              email={store.accountEmail}
              googleName={store.googleName}
              events={store.events}
              openEvent={store.setEventId}
              refresh={store.refresh}
              navigate={navigate}
              logout={store.logout}
            />
          </div>
        </header>
        <main className="main-content">
          <PendingDeletions
            events={store.pendingDeletions}
            refresh={store.refresh}
          />
          {configured && inviteId && (
            <div className="notice">
              <Mail size={18} />
              <div>
                <strong>새 행사에 초대받았습니다</strong>
                <p>로그인한 이메일과 초대 이메일이 일치해야 합니다.</p>
              </div>
              <button
                className="btn primary"
                onClick={async () => {
                  const response = await supabase!.rpc("accept_invitation", {
                    p_id: inviteId,
                  });
                  if (response.error) {
                    setActionError(response.error.message);
                    return;
                  }
                  store.setEventId(response.data);
                  setInviteId("");
                  history.replaceState(null, "", "/");
                  await store.refresh();
                }}
              >
                초대 수락
              </button>
            </div>
          )}
          {!configured && (
            <div className="demo-notice">
              <span className="demo-dot" />
              체험용 데모{" "}
              <span>
                변경사항은 이 브라우저에만 저장되며 서버로 전송되지 않습니다.
              </span>
              <a
                href={testMode ? "/?demo=1&role=judge" : "/?role=judge"}
                target="_blank"
                rel="noreferrer"
              >
                심사 화면 열기 <ExternalLink size={12} />
              </a>
            </div>
          )}
          {view === "dashboard" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="heading-kicker">
                    <span className="eyebrow">PRESENTATION WORKSPACE</span>
                    <span className="badge light-crimson">
                      {operator ? "운영 콘솔" : judge ? "심사위원" : "참여자"}
                    </span>
                  </div>
                  <h1>{data.event.name}</h1>
                  <p>
                    {data.event.subtitle ||
                      "발표 자료 제출부터 현장 진행과 심사까지, 한곳에서."}
                  </p>
                </div>
                {operator && (
                  <button
                    className="btn secondary"
                    onClick={() => setView("settings")}
                  >
                    <Settings2 size={16} />
                    행사 설정
                  </button>
                )}
              </div>
              <div className="stats-grid">
                <Stat
                  label={operator ? "참여 팀" : "배정된 팀"}
                  value={data.teams.length}
                  suffix="팀"
                  icon={<Users size={20} />}
                  detail="함께 만드는 새로운 가능성"
                />
                <Stat
                  label="발표자료 제출"
                  value={submitted}
                  suffix={`/ ${data.teams.length}`}
                  icon={<FileText size={20} />}
                  detail={
                    submitted === data.teams.length
                      ? "모든 자료가 준비되었습니다"
                      : `${data.teams.length - submitted}개 팀 제출 대기 중`
                  }
                  progress={(submitted / (data.teams.length || 1)) * 100}
                />
                <Stat
                  label="발표 진행"
                  value={completed}
                  suffix={`/ ${data.teams.length}`}
                  icon={<MonitorPlay size={20} />}
                  detail={
                    session
                      ? `${data.teams.find((t) => t.id === session.team_id)?.name} · ${session.status === "paused" ? "일시정지" : "발표 중"}`
                      : "발표 시작을 기다리고 있어요"
                  }
                />
                <Stat
                  label="기본 발표 시간"
                  value={durationLabel(data.event.settings.duration_seconds)}
                  suffix=""
                  icon={<Clock3 size={20} />}
                  detail={`종료 ${data.event.settings.warning_seconds}초 전 알림`}
                />
              </div>
              {session && (
                <div className="live-banner">
                  <Radio size={20} />
                  <div>
                    <strong>
                      {data.teams.find((t) => t.id === session.team_id)?.name}{" "}
                      발표가{" "}
                      {session.status === "paused"
                        ? "일시정지되어 있습니다"
                        : "진행 중입니다"}
                    </strong>
                    <span>
                      {session.current_page} / {session.page_count}페이지 · 팀을
                      선택해도 진행 중인 발표는 유지됩니다.
                    </span>
                  </div>
                  {operator && (
                    <button className="btn primary" onClick={openPresenter}>
                      <Maximize size={16} />
                      발표 화면 열기
                    </button>
                  )}
                </div>
              )}
              <div className="workspace-grid">
                <section className="card team-list" data-guide="team-list">
                  <div className="team-list-heading">
                    <h2>
                      {judge ? "심사 팀" : "참여 팀"}
                      <span>{data.teams.length}</span>
                    </h2>
                    {operator && (
                      <button
                        className="icon-btn"
                        aria-label="팀 추가"
                        onClick={() => setView("settings")}
                      >
                        <Plus size={18} />
                      </button>
                    )}
                  </div>
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="팀 검색"
                      placeholder="팀 이름 검색"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <kbd>⌕</kbd>
                  </label>
                  <div className="list-caption">
                    <span>{operator ? "발표 순서" : "팀 목록"}</span>
                    <span>제출 상태</span>
                  </div>
                  <div className="team-rows">
                    {teams.map((t) => {
                      const live = session?.team_id === t.id,
                        done = data.sessions.some(
                          (s) => s.team_id === t.id && s.status === "ended",
                        );
                      return (
                        <div
                          className={`team-row ${team?.id === t.id ? "selected" : ""}`}
                          key={t.id}
                        >
                          <button
                            className="team-select"
                            onClick={() => navigate(() => setSelected(t.id))}
                          >
                            <span
                              className={`team-number ${live ? "live" : ""}`}
                            >
                              {live ? (
                                <Radio size={14} />
                              ) : (
                                String(t.sort_index + 1).padStart(2, "0")
                              )}
                            </span>
                            <span className="team-row-info">
                              <strong>{t.name}</strong>
                              <small>
                                {live
                                  ? "발표 중"
                                  : done
                                    ? "발표 완료"
                                    : `${durationLabel(t.duration_seconds ?? data.event.settings.duration_seconds)} 발표`}
                              </small>
                            </span>
                            <span
                              className={`submission-dot ${t.submission_id ? "ready" : ""}`}
                              title={t.submission_id ? "제출 완료" : "미제출"}
                            >
                              {t.submission_id ? (
                                <Check size={14} />
                              ) : (
                                <Clock3 size={13} />
                              )}
                            </span>
                          </button>
                          {operator && (
                            <div className="order-actions">
                              <button
                                className="icon-btn"
                                disabled={busy || t.sort_index === 0}
                                aria-label={`${t.name} 순서 위로`}
                                onClick={() =>
                                  void act("reorder", {
                                    team_id: t.id,
                                    delta: -1,
                                  })
                                }
                              >
                                <ArrowUp size={12} />
                              </button>
                              <button
                                className="icon-btn"
                                disabled={
                                  busy || t.sort_index === data.teams.length - 1
                                }
                                aria-label={`${t.name} 순서 아래로`}
                                onClick={() =>
                                  void act("reorder", {
                                    team_id: t.id,
                                    delta: 1,
                                  })
                                }
                              >
                                <ArrowDown size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {!teams.length && (
                      <div className="empty-state">
                        {search
                          ? "검색 결과가 없습니다."
                          : "등록되거나 배정된 팀이 없습니다."}
                      </div>
                    )}
                  </div>
                  <div className="team-list-footer">
                    <span>
                      <CheckCircle2 size={13} />
                      제출 완료
                    </span>
                    <span>
                      <Clock3 size={13} />
                      제출 대기
                    </span>
                  </div>
                </section>
                <div className="detail-column">
                  {team ? (
                    judge ? (
                      <ReviewForm
                        key={`${team.id}-${data.me.user_id}`}
                        data={data}
                        team={team}
                        mutate={mutate}
                        onDirty={setDirty}
                      />
                    ) : (
                      <>
                        <section className="card team-detail">
                          <div className="team-detail-header">
                            <div className="team-title-row">
                              <span className="large-team-icon">
                                {team.name.slice(0, 1)}
                              </span>
                              <div>
                                <div className="heading-kicker">
                                  <h2>{team.name}</h2>
                                  <span
                                    className={`badge ${team.submission_id ? "success" : ""}`}
                                  >
                                    {team.submission_id ? (
                                      <CheckCircle2 size={12} />
                                    ) : (
                                      <Clock3 size={12} />
                                    )}{" "}
                                    {team.submission_id
                                      ? "자료 제출 완료"
                                      : "자료 제출 대기"}
                                  </span>
                                </div>
                                <p>
                                  {team.description ||
                                    "등록된 팀 소개가 없습니다."}
                                </p>
                              </div>
                            </div>
                            {team.leader_name && (
                              <p className="team-members">
                                팀장 <strong>{team.leader_name}</strong> · 팀원{" "}
                                {team.member_names?.join(", ") ||
                                  "없음 (1인 팀)"}
                              </p>
                            )}
                            <div className="team-meta">
                              <span>
                                <Users size={15} />
                                발표 순서{" "}
                                <strong>
                                  {String(team.sort_index + 1).padStart(2, "0")}
                                  번
                                </strong>
                              </span>
                              <span>
                                <Clock3 size={15} />
                                발표 시간{" "}
                                <strong>
                                  {durationLabel(
                                    team.duration_seconds ??
                                      data.event.settings.duration_seconds,
                                  )}
                                </strong>
                              </span>
                              {pdf && (
                                <span>
                                  <FileText size={15} />총{" "}
                                  <strong>{pdf.pages}페이지</strong>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="preview-toolbar">
                            <div>
                              <FileText size={16} />
                              <strong>발표자료 미리보기</strong>
                            </div>
                            {pdf && <span className="muted small">PDF</span>}
                          </div>
                          <div className="preview-stage" data-guide="preview">
                            {pdf ? (
                              <PdfViewer submission={pdf} page={previewPage} />
                            ) : (
                              <PdfEmpty />
                            )}
                          </div>
                          {pdf && (
                            <div className="preview-footer">
                              <div className="file-description">
                                <span className="pdf-file-icon">PDF</span>
                                <div>
                                  <strong>{pdf.name}</strong>
                                  <small>
                                    {(pdf.bytes / 1024 / 1024).toFixed(2)}MB ·{" "}
                                    {new Intl.DateTimeFormat("ko-KR", {
                                      month: "2-digit",
                                      day: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      timeZone: "Asia/Seoul",
                                    }).format(new Date(pdf.created_at))}{" "}
                                    제출
                                  </small>
                                </div>
                              </div>
                              <div className="pager">
                                <button
                                  className="icon-btn"
                                  aria-label="미리보기 이전 페이지"
                                  disabled={previewPage === 1}
                                  onClick={() => setPreviewPage((p) => p - 1)}
                                >
                                  <ChevronLeft size={17} />
                                </button>
                                <strong>
                                  {previewPage} <span>/ {pdf.pages}</span>
                                </strong>
                                <button
                                  className="icon-btn"
                                  aria-label="미리보기 다음 페이지"
                                  disabled={previewPage === pdf.pages}
                                  onClick={() => setPreviewPage((p) => p + 1)}
                                >
                                  <ChevronRight size={17} />
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="detail-actions">
                            <p>
                              <ShieldCheck size={15} />
                              {operator
                                ? "발표자료와 타이머가 함께 전체화면으로 표시됩니다."
                                : "제출본은 담당 운영자와 배정된 심사위원만 볼 수 있습니다."}
                            </p>
                            {operator && (
                              <button
                                data-guide="start"
                                className="btn primary start-button"
                                disabled={!pdf || busy || Boolean(session)}
                                onClick={() => void start()}
                              >
                                <Play size={17} fill="currentColor" />
                                발표 시작
                              </button>
                            )}
                            {!operator && (
                              <div data-guide="practice">
                                <Practice
                                  data={data}
                                  team={team}
                                  onOpenChange={setPracticing}
                                />
                              </div>
                            )}
                          </div>
                        </section>
                        {!operator && session?.team_id === team.id && (
                          <section
                            className="card participant-remote"
                            data-guide="participant-live"
                          >
                            <div>
                              <span className="badge light-crimson">
                                <Radio size={13} />
                                발표 중
                              </span>
                              <h3>내 기기로 장표 이동</h3>
                              <p>발표 화면에 실시간으로 반영됩니다.</p>
                            </div>
                            <div className="remote-controls">
                              <button
                                className="btn secondary"
                                disabled={
                                  busy ||
                                  session.current_page === 1 ||
                                  session.status === "preparing"
                                }
                                onClick={() =>
                                  void act("move", {
                                    session_id: session.id,
                                    version: session.version,
                                    delta: -1,
                                  })
                                }
                              >
                                <ChevronLeft />
                                이전
                              </button>
                              <strong>
                                {session.current_page}
                                <span> / {session.page_count}</span>
                              </strong>
                              <button
                                className="btn primary"
                                disabled={
                                  busy ||
                                  session.current_page === session.page_count ||
                                  session.status === "preparing"
                                }
                                onClick={() =>
                                  void act("move", {
                                    session_id: session.id,
                                    version: session.version,
                                    delta: 1,
                                  })
                                }
                              >
                                다음
                                <ChevronRight />
                              </button>
                            </div>
                          </section>
                        )}
                        {!operator && session?.team_id !== team.id && (
                          <section
                            className="card participant-wait"
                            data-guide="participant-live"
                          >
                            운영자가 이 팀의 발표를 시작하면 장표 이동 버튼이
                            표시됩니다.
                          </section>
                        )}
                        <section
                          className="card upload-card"
                          data-guide="upload"
                        >
                          <Upload
                            key={team.id}
                            data={data}
                            team={team}
                            mutate={mutate}
                            refresh={store.refresh}
                          />
                        </section>
                      </>
                    )
                  ) : (
                    <section className="card empty-state">
                      <Users size={32} />
                      <h2>함께할 팀을 기다리고 있어요</h2>
                      <p>
                        {operator
                          ? "행사 설정에서 첫 팀을 등록해 주세요."
                          : "운영자가 팀을 배정하면 이곳에 표시됩니다."}
                      </p>
                      {operator && (
                        <button
                          className="btn primary"
                          onClick={() => setView("settings")}
                        >
                          팀 등록하기
                        </button>
                      )}
                    </section>
                  )}
                </div>
              </div>
              <Footer />
            </>
          )}
          {view === "results" && operator && (
            <Results
              data={data}
              run={async (k, p) => {
                await act(k, p);
              }}
            />
          )}
          {view === "settings" && operator && (
            <SettingsPanel
              guideTab={guideTab}
              openEvent={store.setEventId}
              refresh={store.refresh}
              key={data.event.id}
              data={data}
              run={run}
            />
          )}
          {actionError && (
            <div className="action-error" role="alert">
              <strong>요청을 완료하지 못했습니다</strong>
              <p>{actionError}</p>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => void act("", {}, true)}
              >
                <RefreshCw size={14} />
                같은 요청 재시도
              </button>
              <button
                className="text-button"
                onClick={() => setActionError("")}
              >
                닫기
              </button>
            </div>
          )}
          {store.error && store.connection === "offline" && (
            <div className="error" role="alert">
              {store.error}
              <button
                className="text-button"
                onClick={() => void store.refresh()}
              >
                다시 연결
              </button>
            </div>
          )}
        </main>
      </div>
      <div
        ref={host}
        className={`presentation-container ${presenting ? "is-open" : ""}`}
        aria-label="발표 화면"
      >
        {presenting &&
          (session ? (
            <Presenter
              data={data}
              mutate={mutate}
              offset={store.offset}
              connection={store.connection}
              onClose={closePresenter}
              hostRef={host}
            />
          ) : (
            <div className="presenter-ended">
              <h2>
                {busy
                  ? "발표를 준비하고 있습니다…"
                  : actionError
                    ? "발표를 시작하지 못했습니다"
                    : "발표가 종료되었습니다"}
              </h2>
              {actionError && <p role="alert">{actionError}</p>}
              <button className="btn secondary" onClick={closePresenter}>
                운영 화면으로 돌아가기
              </button>
            </div>
          ))}
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  suffix,
  icon,
  detail,
  progress,
}: {
  label: string;
  value: number | string;
  suffix: string;
  icon: React.ReactNode;
  detail: string;
  progress?: number;
}) {
  return (
    <div className="card stat-card">
      <div>
        <span className="stat-label">{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>
        {value}
        <small>{suffix}</small>
      </strong>
      <div className="stat-bottom">
        <p>{detail}</p>
        {progress !== undefined && (
          <div className="mini-progress">
            <i style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
