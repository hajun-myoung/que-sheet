import {
  authenticate,
  cors,
  json,
  readBody,
  validId,
} from "../_shared/http.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return json({ error: "POST 요청만 지원합니다." }, 405);
  try {
    const auth = await authenticate(req);
    if (!auth) return json({ error: "로그인이 필요합니다." }, 401);
    const body = await readBody(req);
    if (
      !validId(body.event_id) ||
      typeof body.name !== "string" ||
      body.name.length > 100
    )
      return json({ error: "행사와 확인 이름을 확인해 주세요." }, 400);
    const { data: receipt, error } = await auth.admin.rpc(
      "begin_event_deletion",
      { p_actor: auth.user.id, p_event: body.event_id, p_name: body.name },
    );
    if (error) return json({ error: error.message }, 409);
    if (!receipt.completed) {
      for (let i = 0; i < receipt.paths.length; i += 100) {
        const { error: removeError } = await auth.admin.storage
          .from("presentations")
          .remove(receipt.paths.slice(i, i + 100));
        if (removeError) return json({ deleted: true, cleanup_pending: true });
      }
      const { error: finishError } = await auth.admin.rpc(
        "finish_event_deletion",
        { p_actor: auth.user.id, p_event: body.event_id },
      );
      if (finishError) return json({ deleted: true, cleanup_pending: true });
    }
    return json({ deleted: true, cleanup_pending: false });
  } catch {
    return json(
      {
        error: "행사 삭제에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.",
      },
      400,
    );
  }
});
