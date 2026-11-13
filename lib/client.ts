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
} from "./model";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url!, key!) : null;
const STORE = "cue-demo-v1";
type LocalStore = {
  state: Snapshot;
  receipts: Record<string, { fingerprint: string; actor: Role }>;
};
function readLocal(): LocalStore {
  const raw = localStorage.getItem(STORE);
  return raw ? JSON.parse(raw) : { state: seed(), receipts: {} };
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
async function localMutate(command: Command, role: Role) {
  await navigator.locks.request(STORE, async () => {
    const data = readLocal(),
      fingerprint = JSON.stringify(command),
      receipt = data.receipts[command.request_id];
    if (receipt) {
      if (receipt.fingerprint !== fingerprint || receipt.actor !== role)
        throw Error("동일한 요청 ID를 다른 내용에 사용할 수 없습니다.");
      return;
    }
    data.state = reduce(data.state, command, role);
    data.receipts[command.request_id] = { fingerprint, actor: role };
    localStorage.setItem(STORE, JSON.stringify(data));
  });
  announce();
}
export function useWorkspace() {
  const [data, setData] = useState<Snapshot | null>(null),
    [role, setRole] = useState<Role>("operator"),
    [events, setEvents] = useState<{ id: string; name: string }[]>([]),
    [eventId, setEventId] = useState(""),
    [authed, setAuthed] = useState(!configured),
    [connection, setConnection] = useState<"connecting" | "online" | "offline">(
      "connecting",
    ),
    [error, setError] = useState(""),
    [offset, setOffset] = useState(0);
  const generation = useRef(0);
  const realtimeReady = useRef(!configured);
  const roleRef = useRef(role);
  roleRef.current = role;
  const refresh = useCallback(async () => {
    const gen = ++generation.current;
    let start = Date.now();
    try {
      let result: Snapshot;
      if (!supabase) {
        result = visible(readLocal().state, roleRef.current);
      } else {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setAuthed(Boolean(session));
        if (!session) {
          setData(null);
          return;
        }
        const list = await supabase.rpc("list_events");
        if (list.error) throw list.error;
        setEvents(list.data ?? []);
        const id = eventId || list.data?.[0]?.id;
        if (!id) {
          setData(null);
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
      setConnection(realtimeReady.current ? "online" : "connecting");
      setError("");
    } catch (e) {
      if (gen === generation.current) {
        setConnection("offline");
        setError(message(e));
      }
    }
  }, [eventId]);
  useEffect(() => {
    void refresh();
  }, [refresh, role]);
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
        } else await localMutate(command, roleRef.current);
        await refresh();
      } catch (e) {
        await refresh();
        throw Error(message(e));
      }
    },
    [refresh],
  );
  return {
    data,
    role,
    setRole,
    events,
    eventId,
    setEventId,
    authed,
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
) {
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
    xhr.send(body);
  });
}
