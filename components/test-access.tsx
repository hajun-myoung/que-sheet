"use client";
import { ChevronDown } from "lucide-react";
import { testAccounts } from "@/lib/test-workspace";
import { roleLabel, type Role } from "@/lib/model";
import { HelpLanguage, ManualButton, useHelpLanguage } from "./help";
export function TestAccess({
  select,
}: {
  select: (role: Role, credential: string) => void;
}) {
  const { language } = useHelpLanguage();
  return (
    <section
      className="test-access"
      data-guide="test-access"
      aria-label={
        language === "ko" ? "테스트 접속 안내" : "Test access details"
      }
    >
      <div className="test-access-heading">
        <h2>{language === "ko" ? "먼저 체험해 보세요" : "Try it first"}</h2>
        <HelpLanguage />
      </div>
      <p>
        {language === "ko"
          ? "3팀 · 운영자 1명 · 심사위원 2명. 코드를 선택한 뒤 접속 버튼을 누르세요."
          : "3 teams, 1 operator, 2 judges. Select a credential, then sign in."}
      </p>
      <details className="test-access-details" data-guide-expand>
        <summary>
          {language === "ko" ? "자세히보기" : "View details"}
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="test-credentials">
          {testAccounts.map((account) => (
            <button
              type="button"
              key={account.credential}
              onClick={() => select(account.role, account.credential)}
            >
              <span>
                {language === "ko"
                  ? account.name
                  : `${account.role === "participant" ? "Team" : account.role === "operator" ? "Operator" : "Judge"} ${account.user_id.match(/\d+/)?.[0] ?? "1"}`}
              </span>
              <code>{account.credential}</code>
              <small>
                {language === "ko" ? roleLabel[account.role] : account.role}
              </small>
            </button>
          ))}
        </div>
        <p className="test-local-note">
          {language === "ko"
            ? "테스트 변경사항은 이 브라우저에만 저장됩니다. 서버 동기화와 이메일 발송 없이 연습할 수 있습니다."
            : "Changes are stored only in this browser. Practice without server sync or email delivery."}
        </p>
      </details>
      <ManualButton />
    </section>
  );
}
