export type InvitationMail = {
  id: string;
  email: string;
  display_name: string;
  role: "participant" | "operator" | "judge";
  event_name: string;
  team_name: string | null;
  code: string | null;
  expires_at: string | null;
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function invitationMail(inv: InvitationMail, appUrl: string) {
  const link = new URL(appUrl);
  if (
    link.protocol !== "https:" &&
    !(
      link.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(link.hostname)
    )
  )
    throw Error("CUE_APP_URL은 HTTPS 또는 로컬 개발 주소여야 합니다.");
  if (link.username || link.password)
    throw Error("앱 주소에 인증 정보를 넣을 수 없습니다.");
  link.search = "";
  link.hash = "";
  link.searchParams.set("role", inv.role);
  const role = { participant: "참여자", operator: "운영자", judge: "심사위원" }[
    inv.role
  ];
  const code = inv.code?.match(/.{1,8}/g)?.join("-");
  let detail: string;
  if (inv.role === "participant") {
    if (!inv.code || !inv.expires_at) throw Error("참여 코드가 없습니다.");
    link.hash = new URLSearchParams({ code: inv.code }).toString();
    detail = `소속 팀: ${inv.team_name}\n참여 코드: ${code}\n유효 기간: ${new Date(inv.expires_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (한국 시간)\n버튼을 누르면 참여 코드가 입력됩니다. ‘코드로 접속하기’를 눌러 팀 정보와 PDF를 제출해 주세요.\n이 코드는 팀 접근 권한을 제공하므로 해당 팀원에게만 공유해 주세요.`;
  } else {
    link.searchParams.set("invite", inv.id);
    detail = `역할: ${role}\n${inv.email} 이메일로 로그인한 뒤 초대를 수락해 주세요.`;
  }
  const title = `[큐:시트] ${inv.event_name.replace(/[\r\n]/g, " ")} 초대`;
  const intro = `${inv.display_name}님, ${inv.event_name}에 ${role}로 초대합니다.`;
  return {
    subject: title,
    text: `${intro}\n\n${detail}\n\n행사 참여하기: ${link.href}\n\n큐:시트 · 자료 제출부터 발표와 심사까지`,
    html: `<!doctype html><html lang="ko"><body style="margin:0;background:#F8F7F8;font-family:Arial,sans-serif;color:#252126"><main style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #E7E2E5;border-radius:18px;padding:32px"><h1 style="color:#A50034;font-size:24px">큐:시트</h1><h2 style="font-size:20px">${escape(inv.event_name)} 초대</h2><p>${escape(intro)}</p><p style="line-height:1.8;white-space:pre-line">${escape(detail)}</p><p style="margin:28px 0"><a href="${escape(link.href)}" style="background:#A50034;color:white;text-decoration:none;padding:14px 24px;border-radius:10px;display:inline-block">행사 참여하기</a></p><p style="font-size:12px;color:#746B72;overflow-wrap:anywhere">버튼이 열리지 않으면 아래 주소를 복사하세요.<br>${escape(link.href)}</p><hr style="border:0;border-top:1px solid #E7E2E5"><p style="font-size:12px;color:#746B72">큐:시트 · 자료 제출부터 발표와 심사까지</p></main></body></html>`,
  };
}
