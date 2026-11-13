import nodemailer from "npm:nodemailer@10.5.0";
import {
  authenticate,
  cors,
  json,
  readBody,
  validId,
} from "../_shared/http.ts";
import { invitationMail } from "./template.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return json({ error: "POST 요청만 지원합니다." }, 405);
  try {
    const auth = await authenticate(req);
    if (!auth) return json({ error: "로그인이 필요합니다." }, 401);
    const body = await readBody(req);
    if (!validId(body.event_id) || !validId(body.invitation_id))
      return json({ error: "초대 정보를 확인해 주세요." }, 400);
    const { data: member } = await auth.client
      .from("members")
      .select("role")
      .eq("event_id", body.event_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (member?.role !== "operator")
      return json({ error: "운영자 권한이 필요합니다." }, 403);
    const host = Deno.env.get("CUE_SMTP_HOST"),
      port = Number(Deno.env.get("CUE_SMTP_PORT") || 587),
      user = Deno.env.get("CUE_SMTP_USER"),
      pass = Deno.env.get("CUE_SMTP_PASSWORD"),
      from = Deno.env.get("CUE_MAIL_FROM"),
      appUrl = Deno.env.get("CUE_APP_URL");
    if (
      !host ||
      !user ||
      !pass ||
      !from ||
      !appUrl ||
      ![465, 587].includes(port)
    )
      return json(
        { error: "일괄 초대용 SMTP와 앱 주소 설정이 필요합니다." },
        503,
      );
    // Validate configuration before claiming any mail.
    invitationMail(
      {
        id: body.invitation_id,
        email: "test@example.com",
        display_name: "",
        role: "judge",
        event_name: "",
        team_name: null,
        code: null,
        expires_at: null,
      },
      appUrl,
    );
    const attempt = crypto.randomUUID();
    const { data: inv, error } = await auth.admin.rpc(
      "claim_invitation_email",
      {
        p_actor: auth.user.id,
        p_event: body.event_id,
        p_id: body.invitation_id,
        p_attempt: attempt,
      },
    );
    if (error) return json({ error: error.message }, 409);
    if (inv.status !== "claimed") return json({ status: inv.status });
    let status = "sent",
      reason: string | null = null;
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
    try {
      await transport.sendMail({
        from: { name: "큐:시트", address: from },
        to: inv.email,
        ...invitationMail(inv, appUrl),
        messageId: `<${attempt}@cue.local>`,
      });
    } catch (e) {
      const err = e as { code?: string; responseCode?: number };
      const rejected =
        (err.responseCode ?? 0) >= 400 ||
        ["EAUTH", "EDNS"].includes(err.code ?? "");
      status = rejected ? "failed" : "unknown";
      reason = rejected
        ? "메일 서버가 발송을 거절했습니다. 주소와 SMTP 설정을 확인해 주세요."
        : "발송 결과를 확인하지 못했습니다. 수신 여부를 확인한 뒤 재발송해 주세요.";
    } finally {
      transport.close();
    }
    const { error: finishError } = await auth.admin.rpc(
      "finish_invitation_email",
      {
        p_id: body.invitation_id,
        p_attempt: attempt,
        p_status: status,
        p_error: reason,
      },
    );
    if (finishError)
      return json({
        status: "unknown",
        error:
          "발송 결과 저장을 확인하지 못했습니다. 수신 여부를 확인해 주세요.",
      });
    return json({ status, error: reason });
  } catch {
    return json(
      {
        error:
          "메일 발송 요청을 처리하지 못했습니다. 상태를 확인한 뒤 다시 시도해 주세요.",
      },
      400,
    );
  }
});
