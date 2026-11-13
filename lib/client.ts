"use client";
import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { seed, reduce, visible } from "./demo";
import {
  uuid,
  type Command,
  type Snapshot,
  type Role,
  type Submission,
  MAX_PDF_BYTES,
  normalizeCode,
  validateTeamProfile,
  type TeamProfile,
} from "./model";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url!, key!) : null;
const STORE = "cue-demo-v1";
type LocalStore = {
  state: Snapshot;
  receipts: Record<string, { fingerprint: string; actor: string }>;
  accessCodes?: Record<string, { team_id: string; expires_at: string }>;
};
function readLocal(): LocalStore {
  const raw = localStorage.getItem(STORE);
  const data: LocalStore = raw
    ? JSON.parse(raw)
    : { state: seed(), receipts: {} };
  data.accessCodes ??= {
    CUE2026: { team_id: "team-5", expires_at: "2099-01-01" },
    READY2026: { team_id: "team-1", expires_at: "2099-01-01" },
  };
  return data;
}
function announce() {
  const channel = new BroadcastChannel(STORE);
  channel.postMessage("updated");
  channel.close();
  window.dispatchEvent(new Event("cue-updated"));
}
export function request(
  kind: string,
  event_id: string,
  payload: Record<string, unknown>,
): Command {
  return { kind, event_id, request_id: uuid(), payload };
}
async function localMutate(command: Command, role: Role, teamId?: string) {
  const actor = role === "participant" ? `${role}:${teamId}` : role;
  await navigator.locks.request(STORE, async () => {
    const data = readLocal(),
      fingerprint = JSON.stringify(command),
      receipt = data.receipts[command.request_id];
    if (receipt) {
      if (receipt.fingerprint !== fingerprint || receipt.actor !== actor)
        throw Error("동일한 요청 ID를 다른 내용에 사용할 수 없습니다.");
      return;
    }
    data.state = reduce(data.state, command, role, Date.now(), teamId);
    data.receipts[command.request_id] = { fingerprint, actor };
    localStorage.setItem(STORE, JSON.stringify(data));
  });
  announce();
}
export function useWorkspace() {
  const [data, setData] = useState<Snapshot | null>(null),
    [role, setRole] = useState<Role>("operator"),
    [events, setEvents] = useState<{ id: string; name: string }[]>([]),
    [eventId, setEventId] = useState(""),
    [authed, setAuthed] = useState(false),
    [accountEmail, setAccountEmail] = useState<string | null>(null),
    [googleName, setGoogleName] = useState<string | null>(null),
    [pendingDeletions, setPendingDeletions] = useState<
      { id: string; name: string }[]
    >([]),
    [authReady, setAuthReady] = useState(false),
    [connection, setConnection] = useState<"connecting" | "online" | "offline">(
      "connecting",
    ),
    [error, setError] = useState(""),
    [offset, setOffset] = useState(0);
  const generation = useRef(0);
  const realtimeReady = useRef(!configured);

  const refresh = useCallback(async () => {
    const gen = ++generation.current;
    let start = Date.now();
    try {
      let result: Snapshot;
      if (!supabase) {
        const identity = readDemoAccess();
        if (!identity) {
          setAuthed(false);
          setData(null);
          return;
        }
        setAuthed(true);
        setRole(identity.role);
        result = visible(readLocal().state, identity.role, identity.team_id);
      } else {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setAuthed(Boolean(session));
        // Display only: event permissions always come from DB membership.
        const profile = session?.user.identities?.find(
          (i) => i.provider === "google",
        )?.identity_data;
        const name = profile?.full_name ?? profile?.name;
        setGoogleName(
          typeof name === "string" && name.trim() ? name.trim() : null,
        );
        setAccountEmail(
          session &&
            !session.user.is_anonymous &&
            session.user.email_confirmed_at
            ? (session.user.email ?? null)
            : null,
        );
        if (!session) {
          setEvents([]);
          setPendingDeletions([]);
          setData(null);
          setError("");
          return;
        }
        const [list, cleanup] = await Promise.all([
          supabase.rpc("list_events"),
          supabase.rpc("pending_event_deletions"),
        ]);
        if (gen !== generation.current) return;
        if (list.error) throw list.error;
        if (cleanup.error) throw cleanup.error;
        setPendingDeletions(cleanup.data ?? []);
        setEvents(list.data ?? []);
        const id = list.data?.some((e: { id: string }) => e.id === eventId)
          ? eventId
          : list.data?.[0]?.id;
        if (!id) {
          setData(null);
          setError("");
          setConnection("online");
          return;
        }
        start = Date.now();
        const response = await supabase.rpc("app_snapshot", { p_event: id });
        if (response.error) throw response.error;
        result = response.data;
      }
      if (gen !== generation.current) return;
      setOffset(Date.parse(result.server_time) - (start + Date.now()) / 2);
      setData(result);
      setRole(result.me.role);
      setConnection(realtimeReady.current ? "online" : "connecting");
      setError("");
    } catch (e) {
      if (gen === generation.current) {
        setConnection("offline");
        setError(message(e));
      }
    } finally {
      if (gen === generation.current) setAuthReady(true);
    }
  }, [eventId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    let channel:
      ReturnType<NonNullable<typeof supabase>["channel"]> | undefined;
    const local = new BroadcastChannel(STORE);
    local.onmessage = () => void refresh();
    const sync = () => void refresh();
    const offline = () => setConnection("offline");
    window.addEventListener("cue-updated", sync);
    window.addEventListener("online", sync);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", sync);
    const interval = setInterval(sync, 10000);
    const auth = supabase?.auth.onAuthStateChange(() => {
      setTimeout(sync, 0);
    });
    if (supabase && data?.event.id) {
      channel = supabase
        .channel(`event-${data.event.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "event_updates",
            filter: `event_id=eq.${data.event.id}`,
          },
          sync,
        )
        .subscribe((status) => {
          realtimeReady.current = status === "SUBSCRIBED";
          if (status === "SUBSCRIBED") {
            setConnection("online");
            sync();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
            setConnection("offline");
        });
    }
    return () => {
      clearInterval(interval);
      local.close();
      window.removeEventListener("cue-updated", sync);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", sync);
      auth?.data.subscription.unsubscribe();
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [refresh, data?.event.id]);
  const mutate = useCallback(
    async (command: Command) => {
      if (!navigator.onLine && configured)
        throw Error("연결이 끊겼습니다. 연결 후 다시 시도해 주세요.");
      try {
        if (supabase) {
          const { error } = await supabase.rpc("app_command", {
            p_event: command.event_id,
            p_request: command.request_id,
            p_kind: command.kind,
            p: command.payload,
          });
          if (error) throw error;
        } else {
          const identity = readDemoAccess();
          if (!identity) throw Error("로그인이 필요합니다.");
          await localMutate(command, identity.role, identity.team_id);
        }
        await refresh();
      } catch (e) {
        await refresh();
        throw Error(message(e));
      }
    },
    [refresh],
  );
  async function login(nextRole: Role, code = "") {
    if (!supabase) {
      let team_id: string | undefined;
      if (nextRole === "participant") {
        const entry = readLocal().accessCodes![normalizeCode(code)];
        if (!entry || Date.parse(entry.expires_at) <= Date.now())
          throw Error("코드가 올바르지 않거나 만료되었습니다.");
        team_id = entry.team_id;
      }
      sessionStorage.setItem(
        "cue-access",
        JSON.stringify({ role: nextRole, team_id }),
      );
      await refresh();
      return;
    }
    if (nextRole !== "participant") return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    }
    const { data: accepted, error } = await supabase.rpc(
      "redeem_participant_code",
      { p_code: code },
    );
    if (error) throw error;
    if (accepted.error) throw Error(accepted.error);
    setEventId(accepted.event_id);
    await refresh();
  }
  async function logout() {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } else sessionStorage.removeItem("cue-access");
    generation.current++;
    setData(null);
    setAuthed(false);
    setAccountEmail(null);
    setGoogleName(null);
    setEvents([]);
    setPendingDeletions([]);
    setEventId("");
  }
  return {
    data,
    role,
    login,
    logout,
    authReady,
    events,
    eventId,
    setEventId,
    authed,
    accountEmail,
    googleName,
    pendingDeletions,
    connection,
    error,
    setError,
    offset,
    refresh,
    mutate,
  };
}
export function message(e: unknown) {
  return e instanceof Error
    ? e.message
    : typeof e === "object" && e !== null && "message" in e
      ? String(e.message)
      : "요청을 처리하지 못했습니다. 다시 시도해 주세요.";
}
let pdfModule: Promise<typeof import("pdfjs-dist")> | undefined;
export function pdfjs() {
  return (pdfModule ??= (async () => {
    const module = await import("pdfjs-dist");
    module.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return module;
  })());
}
async function pdfDatabase() {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("cue-pdfs", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}
async function savePdf(id: string, file: File) {
  const db = await pdfDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
export async function pdfUrl(submission: Submission) {
  if (!supabase) {
    if (submission.path === "/sample.pdf") return "/sample.pdf";
    const db = await pdfDatabase();
    const file = await new Promise<Blob>((resolve, reject) => {
      const req = db
        .transaction("files")
        .objectStore("files")
        .get(submission.path);
      req.onsuccess = () =>
        req.result
          ? resolve(req.result)
          : reject(Error("이 브라우저에 PDF가 없습니다. 다시 제출해 주세요."));
      req.onerror = () => reject(req.error);
    });
    db.close();
    return URL.createObjectURL(file);
  }
  const { data, error } = await supabase.storage
    .from("presentations")
    .createSignedUrl(submission.path, 300);
  if (error) throw error;
  return data.signedUrl;
}
export async function validatePdf(file: File) {
  if (file.size > MAX_PDF_BYTES || file.size === 0)
    throw Error("PDF는 0바이트 초과, 20MB 이하여야 합니다.");
  if (
    !/\.pdf$/i.test(file.name) ||
    (file.type && file.type !== "application/pdf")
  )
    throw Error("PDF 파일만 제출할 수 있습니다.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw Error("올바른 PDF 파일이 아닙니다.");
  const lib = await pdfjs();
  const task = lib.getDocument({ data: bytes, stopAtErrors: true });
  task.onPassword = () => {
    void task.destroy();
  };
  try {
    const doc = await task.promise;
    if (doc.numPages < 1 || doc.numPages > 500)
      throw Error("PDF는 1~500페이지여야 합니다.");
    const page = await doc.getPage(1);
    await page.getOperatorList();
    const pages = doc.numPages;
    await doc.destroy();
    return pages;
  } catch {
    await task.destroy();
    throw Error(
      "손상되었거나 암호가 있는 PDF입니다. 암호를 해제한 PDF를 제출해 주세요.",
    );
  }
}
export async function uploadPdf(
  file: File,
  teamId: string,
  s: Snapshot,
  onProgress: (p: number) => void,
  mutate: (c: Command) => Promise<void>,
  requestId: string,
  createdAt: string,
  profile?: TeamProfile,
) {
  if (profile) validateTeamProfile(profile);
  const pages = await validatePdf(file);
  const team = s.teams.find((t) => t.id === teamId)!;
  if (!supabase) {
    onProgress(35);
    await savePdf(requestId, file);
    onProgress(85);
    await mutate({
      kind: "submission",
      event_id: s.event.id,
      request_id: requestId,
      payload: {
        team_id: teamId,
        previous_id: team.submission_id,
        ...(profile ? { profile } : {}),
        submission: {
          id: requestId,
          event_id: s.event.id,
          team_id: teamId,
          path: requestId,
          name: file.name,
          pages,
          bytes: file.size,
          created_at: createdAt,
        },
      },
    });
    onProgress(100);
    return;
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw Error("로그인이 필요합니다.");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${url}/functions/v1/submit-pdf`);
    xhr.timeout = 120000;
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", key!);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 95));
    };
    xhr.onerror = () =>
      reject(Error("업로드 연결이 끊겼습니다. 재시도해 주세요."));
    xhr.ontimeout = () =>
      reject(Error("업로드 시간이 초과되었습니다. 재시도해 주세요."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        try {
          reject(Error(JSON.parse(xhr.responseText).error));
        } catch {
          reject(Error("업로드에 실패했습니다. 재시도해 주세요."));
        }
      }
    };
    const body = new FormData();
    body.set("file", file);
    body.set("event_id", s.event.id);
    body.set("team_id", teamId);
    body.set("previous_id", team.submission_id ?? "");
    body.set("request_id", requestId);
    if (profile) body.set("profile", JSON.stringify(profile));
    xhr.send(body);
  });
}

function readDemoAccess(): { role: Role; team_id?: string } | null {
  const raw = sessionStorage.getItem("cue-access");
  if (!raw) return null;
  const value = JSON.parse(raw);
  return ["operator", "participant", "judge"].includes(value.role)
    ? value
    : null;
}
export async function issueParticipantCode(
  eventId: string,
  teamId: string,
): Promise<{ code: string; expires_at: string }> {
  if (supabase) {
    const { data, error } = await supabase.rpc("issue_participant_code", {
      p_event: eventId,
      p_team: teamId,
    });
    if (error) throw error;
    return data;
  }
  return navigator.locks.request(STORE, () => {
    if (readDemoAccess()?.role !== "operator")
      throw Error("운영자만 코드를 발급할 수 있습니다.");
    const data = readLocal();
    if (
      data.state.event.id !== eventId ||
      !data.state.teams.some((t) => t.id === teamId)
    )
      throw Error("팀을 찾을 수 없습니다.");
    const code = normalizeCode(uuid()),
      expires_at = new Date(Date.now() + 7 * 86400000).toISOString();
    for (const [key, value] of Object.entries(data.accessCodes!))
      if (value.team_id === teamId) delete data.accessCodes![key];
    data.accessCodes![code] = { team_id: teamId, expires_at };
    localStorage.setItem(STORE, JSON.stringify(data));
    return { code, expires_at };
  });
}

export async function invokeEdge<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!supabase) throw Error("실제 Supabase 연결에서 사용할 수 있습니다.");
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let detail: string | undefined;
    if (error.context instanceof Response) {
      try {
        detail = (await error.context.json()).error;
      } catch {
        /* Network / non-JSON response. */
      }
    }
    throw Error(
      detail ||
        "서버에 연결하지 못했습니다. 상태를 확인하고 다시 시도해 주세요.",
    );
  }
  if (data?.error && !data?.status) throw Error(data.error);
  return data as T;
}
