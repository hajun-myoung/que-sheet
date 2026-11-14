import type { Role } from "./model";
export type Language = "ko" | "en";
export type GuideRole = Role | "signin" | "submission";
export type GuideStep = {
  id: string;
  target: string;
  title: Record<Language, string>;
  body: Record<Language, string>;
  view?: "dashboard" | "settings" | "results";
  tab?: string;
  advanceOnClick?: boolean;
  actions?: string[];
};
function step(
  id: string,
  target: string,
  ko: string,
  en: string,
  bodyKo: string,
  bodyEn: string,
  options: Partial<GuideStep> = {},
): GuideStep {
  return {
    id,
    target,
    title: { ko, en },
    body: { ko: bodyKo, en: bodyEn },
    ...options,
  };
}
export const guides: Record<GuideRole, GuideStep[]> = {
  signin: [
    step(
      "role",
      "[data-guide='roles']",
      "역할 선택",
      "Choose your role",
      "참여자는 참여 코드로, 운영자와 심사위원은 이메일로 접속합니다. 역할 버튼을 누르거나 다음 화살표로 이동하세요.",
      "Participants use an access code. Operators and judges use email. Choose a role or use the next arrow.",
      { advanceOnClick: true },
    ),
    step(
      "credentials",
      "[data-guide='credentials']",
      "코드 또는 이메일 입력",
      "Enter your code or email",
      "운영자가 전달한 정보를 입력하세요. 테스트 계정은 왼쪽 체험 안내에서 선택할 수 있습니다.",
      "Enter the details supplied by your operator. Sample credentials are available in the test workspace panel.",
    ),
    step(
      "test",
      "[data-guide='test-access']",
      "테스트 워크스페이스",
      "Try the test workspace",
      "3팀·운영자 1명·심사위원 2명의 예시입니다. 안내된 코드를 누르면 로그인 입력란에 채워집니다. 변경은 이 브라우저에만 저장됩니다. 아래 PDF 사용설명서에서 전체 순서를 확인할 수 있습니다.",
      "Explore three teams, one operator and two judges. Select a sample credential to fill the sign-in form. Changes stay in this browser. Open the PDF manual below for all workflows.",
    ),
  ],
  operator: [
    step(
      "settings",
      "[data-guide='settings-nav']",
      "행사 설정 열기",
      "Open event settings",
      "행사 설정을 눌러 발표 시간, 팀과 심사 기준을 준비합니다. 버튼을 누르거나 다음으로 이동하세요.",
      "Open event settings to prepare timing, teams and evaluation criteria. Click the highlighted button or choose Next.",
      { view: "dashboard", advanceOnClick: true },
    ),
    step(
      "timer",
      "[data-guide='timer-settings']",
      "타이머와 표시 색상",
      "Set the timer and colors",
      "기본 발표 시간, 종료 임박 기준, 정상·임박·초과 색상을 조정하고 설정 저장을 누르세요. 변경은 다음 발표부터 적용됩니다.",
      "Set the duration, warning threshold and normal, warning and overtime colors, then save. Changes apply to the next presentation.",
      { actions: ["settings"], view: "settings", tab: "timer" },
    ),
    step(
      "members",
      "[data-guide='team-settings']",
      "팀 등록과 발표 시간",
      "Register teams",
      "팀 이름과 소개를 입력해 팀을 등록하세요. 팀별 발표 시간을 별도로 지정할 수도 있습니다.",
      "Enter a team name and description to register a team. You can also set a separate presentation duration for each team.",
      { actions: ["team"], view: "settings", tab: "teams" },
    ),
    step(
      "codes",
      "[data-guide='participant-codes']",
      "팀별 참여 코드 발급",
      "Issue participant codes",
      "각 팀의 코드 발급 버튼으로 참여 코드를 만들고 해당 팀에 전달하세요. 재발급하면 기존 코드의 새 접속이 차단됩니다.",
      "Issue a code for each team and share it with that team. Reissuing a code prevents new sign-ins with the previous code.",
      { actions: ["participant-code"], view: "settings", tab: "teams" },
    ),
    step(
      "judges",
      "[data-guide='judge-settings']",
      "심사위원 초대와 팀 배정",
      "Invite and assign judges",
      "심사위원을 등록·초대한 뒤 담당 팀을 체크하세요. 테스트에서는 등록·배정이 로컬에 저장되며 이메일 발송은 제공되지 않습니다.",
      "Register or invite judges, then select their assigned teams. Test mode saves registration and assignments locally. Email delivery requires the live service.",
      { actions: ["invite", "assign"], view: "settings", tab: "teams" },
    ),
    step(
      "rubric",
      "[data-guide='rubric-settings']",
      "평가 기준 설정",
      "Define evaluation criteria",
      "항목명과 배점을 입력하고 새 기준을 저장하세요. 이미 시작한 평가는 기존 기준 버전을 유지합니다.",
      "Edit criterion names and maximum scores, then save a new version. Evaluations already started keep their original version.",
      { actions: ["rubric"], view: "settings", tab: "rubric" },
    ),
    step(
      "teams",
      "[data-guide='team-list']",
      "발표할 팀 선택",
      "Select a team",
      "팀 목록에서 제출 상태와 발표 순서를 확인하세요. 팀을 선택하면 오른쪽에 PDF가 표시됩니다.",
      "Check submission status and presentation order. Select a team to preview its PDF on the right.",
      { view: "dashboard", advanceOnClick: true },
    ),
    step(
      "preview",
      "[data-guide='preview']",
      "발표자료 확인",
      "Preview the presentation",
      "PDF와 페이지 이동 버튼을 확인하세요. 자료가 없는 팀은 먼저 참여 코드로 PDF를 제출해야 합니다.",
      "Review the PDF and page controls. A team without a submission must first upload a PDF using its access code.",
      { view: "dashboard" },
    ),
    step(
      "start",
      "[data-guide='start']",
      "발표 시작",
      "Start the presentation",
      "발표 시작을 누르면 PDF와 타이머가 전체화면에 표시됩니다. 방향키와 리모컨으로 장표를 넘겨도 타이머는 유지됩니다. 실제 발표를 시작하면 가이드는 닫힙니다.",
      "Start opens the PDF and timer in fullscreen. Arrow keys and a presentation remote change slides while timing continues. Starting closes this guide.",
      { actions: ["start"], view: "dashboard" },
    ),
    step(
      "results",
      "[data-guide='results']",
      "심사 현황 확인",
      "Review evaluation results",
      "팀별 평균과 심사위원별 세부 점수·비고를 확인하세요. 미제출 심사는 제출 상태로 구분됩니다.",
      "Review team averages and each judge's scores and notes. Pending evaluations are shown by submission status.",
      { view: "results" },
    ),
  ],
  participant: [
    step(
      "participant-pdf",
      "[data-guide='preview']",
      "제출 자료 확인",
      "Review your submission",
      "본인 팀의 PDF와 페이지 수를 확인하세요. 오른쪽 페이지 버튼으로 장표를 미리 볼 수 있습니다.",
      "Check your team's PDF and page count. Use the page controls to preview slides.",
    ),
    step(
      "participant-upload",
      "[data-guide='upload']",
      "PDF 교체",
      "Replace your PDF",
      "새 PDF를 올려 제출본을 교체할 수 있습니다. PDF는 20MB 이하, 1~500페이지이며 암호가 없어야 합니다.",
      "Upload a new PDF to replace your submission. Files must be at most 20 MiB, contain 1–500 pages and have no password.",
      { actions: ["submission"] },
    ),
    step(
      "practice",
      "[data-guide='practice']",
      "발표 연습",
      "Rehearse your presentation",
      "발표 연습하기를 누르면 개인 연습용 PDF와 타이머가 열립니다. 실제 행사 발표와 심사에는 영향을 주지 않습니다.",
      "Open practice to rehearse with your PDF and a timer. Your rehearsal is independent of the live event and evaluations.",
    ),
    step(
      "live",
      "[data-guide='participant-live']",
      "현장 장표 제어",
      "Control live slides",
      "운영자가 본인 팀 발표를 시작하면 이전·다음 버튼이 활성화됩니다. 장표 이동은 타이머를 변경하지 않습니다.",
      "Once the operator starts your team's presentation, previous and next controls become available. Moving slides preserves the timer.",
      { actions: ["move"] },
    ),
  ],
  judge: [
    step(
      "judge-team",
      "[data-guide='team-list']",
      "심사할 팀 선택",
      "Select an assigned team",
      "배정된 팀을 선택하세요. 본인에게 배정된 팀만 표시됩니다.",
      "Choose an assigned team. Only teams assigned to you appear.",
      { advanceOnClick: true },
    ),
    step(
      "judge-start",
      "[data-guide='review']",
      "심사 시작과 기준 확인",
      "Start an evaluation",
      "심사 시작을 누르면 평가 기준이 고정되고 입력란이 활성화됩니다. 항목별 최대 점수를 확인하세요.",
      "Start the evaluation to lock its criteria version and enable input. Check the maximum score for each criterion.",
      { actions: ["review"] },
    ),
    step(
      "judge-scores",
      "[data-guide='scores']",
      "점수와 의견 입력",
      "Enter scores and feedback",
      "각 항목의 점수를 입력하고 비고에 피드백을 남기세요. 저장 전에는 입력 내용이 사라질 수 있으니 임시저장을 사용하세요.",
      "Enter criterion scores and feedback in the notes field. Save a draft to preserve your work.",
    ),
    step(
      "judge-save",
      "[data-guide='review-save']",
      "임시저장과 최종 제출",
      "Save or submit",
      "임시저장 후 계속 수정할 수 있습니다. 최종 제출 후에는 운영자가 재작성을 허용할 때까지 읽기 전용입니다.",
      "Drafts remain editable. A final submission is read-only until an operator reopens it.",
      { actions: ["review"] },
    ),
  ],
  submission: [
    step(
      "profile",
      "[data-guide='team-profile']",
      "팀 정보 입력",
      "Enter team details",
      "팀명과 팀장 이름을 입력하세요. 팀원은 팀장 외 최대 30명까지 줄바꿈으로 입력합니다.",
      "Enter your team name and leader. Add up to 30 other members, one per line.",
    ),
    step(
      "file",
      "[data-guide='submission-pdf']",
      "발표 PDF 선택",
      "Choose a presentation PDF",
      "암호 없는 PDF를 선택하세요. 20MB 이하, 1~500페이지 파일을 사용할 수 있습니다.",
      "Choose an unencrypted PDF of at most 20 MiB and 1–500 pages.",
    ),
    step(
      "submit",
      "[data-guide='submission-submit']",
      "제출 완료",
      "Complete the submission",
      "제출하기를 누르면 팀 정보와 PDF가 함께 저장됩니다. 제출 후에는 본인 팀 화면에서 자료 확인과 발표 연습이 가능합니다.",
      "Submit to save your team details and PDF together. Your team workspace then offers previews and rehearsal.",
    ),
  ],
};
export const guideRoleLabels: Record<GuideRole, Record<Language, string>> = {
  signin: { ko: "접속하기", en: "Sign in" },
  operator: { ko: "운영자", en: "Operator" },
  participant: { ko: "참여자", en: "Participant" },
  judge: { ko: "심사위원", en: "Judge" },
  submission: { ko: "첫 자료 제출", en: "First submission" },
};
