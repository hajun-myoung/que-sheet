import { createClient } from "npm:@supabase/supabase-js@2";
import { parsePdf } from "./pdf.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const max = 20 * 1024 * 1024;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return json({ error: "POST 요청만 지원합니다." }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer "))
      return json({ error: "로그인이 필요합니다." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!,
      anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const client = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user)
      return json({ error: "로그인이 만료되었습니다." }, 401);
    // Bound the stream even when Content-Length is absent or dishonest.
    const reader = req.body?.getReader();
    if (!reader) return json({ error: "파일이 없습니다." }, 400);
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max + 65536) {
        await reader.cancel();
        return json({ error: "파일 크기 상한은 20MB입니다." }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    const form = await new Response(bytes, {
      headers: { "Content-Type": req.headers.get("Content-Type") ?? "" },
    }).formData();
    const event = String(form.get("event_id")),
      team = String(form.get("team_id")),
      id = String(form.get("request_id")),
      previous = String(form.get("previous_id") ?? "") || null;
    const validId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      ![event, team, id, ...(previous ? [previous] : [])].every((x) =>
        validId.test(x),
      )
    )
      return json({ error: "올바르지 않은 요청입니다." }, 400);
    const { data: member } = await client
      .from("members")
      .select("role,team_id")
      .eq("event_id", event)
      .eq("user_id", user.id)
      .single();
    if (
      !member ||
      !(
        member.role === "operator" ||
        (member.role === "participant" && member.team_id === team)
      )
    )
      return json({ error: "제출 권한이 없습니다." }, 403);
    const { data: allowedTeam } = await client
      .from("teams")
      .select("id,submission_id")
      .eq("event_id", event)
      .eq("id", team)
      .single();
    if (!allowedTeam) return json({ error: "팀을 찾을 수 없습니다." }, 403);
    let profile: unknown = undefined;
    if (form.has("profile")) {
      try {
        profile = JSON.parse(String(form.get("profile")));
      } catch {
        return json({ error: "팀 정보 형식이 올바르지 않습니다." }, 400);
      }
    }
    if (
      member.role === "participant" &&
      !allowedTeam.submission_id &&
      profile === undefined
    )
      return json({ error: "팀 정보와 PDF를 함께 제출해 주세요." }, 400);
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !file.name.toLowerCase().endsWith(".pdf") ||
      file.name.length > 255 ||
      file.type !== "application/pdf" ||
      file.size === 0 ||
      file.size > max
    )
      return json({ error: "20MB 이하 PDF를 제출해 주세요." }, 400);
    const contents = new Uint8Array(await file.arrayBuffer());
    let pages: number;
    try {
      pages = await parsePdf(contents, file.name, file.type);
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : "PDF를 확인해 주세요." },
        400,
      );
    }
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", contents)),
    )
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    const path = `${event}/${team}/${id}-${digest}.pdf`;
    const admin = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: existing } = await admin
      .from("submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (existing) {
      if (existing.path !== path || existing.name !== file.name)
        return json({ error: "동일 요청 ID의 파일이 다릅니다." }, 409);
      if (profile === undefined) return json(existing);
    }
    const { error: uploadError } = await admin.storage
      .from("presentations")
      .upload(path, contents, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError && !["409", "400"].includes(String(uploadError.statusCode)))
      return json(
        { error: "저장소 업로드에 실패했습니다. 다시 시도해 주세요." },
        502,
      );
    // A duplicate object is accepted only after verifying the content-hash path exists.
    if (uploadError) {
      const { data: object, error } = await admin.storage
        .from("presentations")
        .download(path);
      if (error || !object)
        return json({ error: "저장소 확인에 실패했습니다." }, 502);
    }
    const { data, error } = await admin.rpc(
      profile === undefined
        ? "finalize_submission"
        : "finalize_submission_with_profile",
      {
        p_actor: user.id,
        p_event: event,
        p_team: team,
        p_previous: previous,
        p_id: id,
        p_name: file.name,
        p_path: path,
        p_pages: pages,
        p_bytes: file.size,
        ...(profile === undefined ? {} : { p_profile: profile }),
      },
    );
    if (error) {
      const { data: reference } = await admin
        .from("submissions")
        .select("id")
        .eq("path", path)
        .maybeSingle();
      if (!reference) await admin.storage.from("presentations").remove([path]);
      return json({ error: error.message }, 409);
    }
    return json(data);
  } catch (e) {
    console.error("submit-pdf", e instanceof Error ? e.name : "Unknown");
    return json(
      {
        error:
          "파일을 처리하지 못했습니다. 연결 상태를 확인하고 재시도해 주세요.",
      },
      400,
    );
  }
});
