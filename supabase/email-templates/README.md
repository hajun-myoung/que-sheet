# Supabase 인증 메일

프로젝트 `nidalecwnnxlmxptibua`의 Authentication → Emails에 직접 적용한 제목과 HTML 원본입니다.
큐:시트 크림슨 색상(`#A50034`), 흰색 카드, 한국어 안내를 사용합니다.

| Supabase 항목 | 본문 파일 | 제목 |
| --- | --- | --- |
| Invite user | `invite-user.html` | [큐:시트] 계정 초대가 도착했습니다 |
| Magic link or OTP | `magic-link-or-otp.html` | [큐:시트] 로그인 링크가 도착했습니다 |
| Change email address | `change-email-address.html` | [큐:시트] 이메일 주소 변경을 확인해 주세요 |
| Reset password | `reset-password.html` | [큐:시트] 비밀번호 재설정을 안내합니다 |
| Reauthentication | `reauthentication.html` | [큐:시트] 본인 확인 인증번호를 안내합니다 |

## 직접 수정하기

1. [Supabase 인증 메일 설정](https://supabase.com/dashboard/project/nidalecwnnxlmxptibua/auth/templates)에서 해당 항목을 엽니다.
2. `Subject`에 제목을, `Body → Source`에 해당 HTML 전체를 입력합니다.
3. `Preview`를 확인하고 `Save changes`를 누릅니다.
4. 변경 내용을 이 폴더의 HTML과 `subjects.json`에도 반영합니다. 로컬 파일 변경이나 앱 배포만으로 Supabase 설정이 자동 변경되지는 않습니다.

되돌리려면 `previous-templates.json`의 해당 항목 `subject`와 `body`를 같은 화면에 입력하고 저장합니다. 이 파일은 적용 직전 대시보드에 있던 기본 템플릿의 백업입니다.

## 인증 변수와 범위

- 링크가 있는 네 종류의 `{{ .ConfirmationURL }}`은 Supabase가 생성하는 인증 링크이므로 유지합니다.
- Magic link or OTP는 현재 앱의 링크 로그인 흐름을 유지합니다. OTP 입력 방식으로 전환하려면 앱의 코드 입력·검증 흐름도 별도로 구현해야 합니다.
- Reauthentication은 `{{ .Token }}` 인증번호를 표시합니다. 임의의 확인 링크로 대체하지 않습니다.
- 이메일 변경은 `{{ .NewEmail }}`을 표시하며, `{{ .Email }}`이 있을 때 기존 주소도 표시합니다. 기존·새 주소의 확인 요구 여부는 Supabase 보안 설정을 따릅니다.
- 이 변경은 메일 표현만 수정합니다. 앱의 비밀번호 재설정·이메일 변경·재인증 화면이나 행사 역할을 추가하지 않습니다.
- Confirm signup과 보안 알림 템플릿은 이번 변경 대상이 아닙니다.
- 행사 멤버 일괄 초대 메일은 별도 파일 `supabase/functions/send-invitations/template.ts`에서 관리합니다.

## 검증

- 다섯 항목의 제목·본문을 대시보드에서 입력하고 Preview 및 저장 완료 상태를 확인했습니다.
- Reauthentication은 새로고침 후 저장된 제목·본문 미리보기를 확인했습니다.
- 로컬 HTML의 태그 구조, 필수 인증 변수, 외부 리소스 미사용을 확인했습니다.
- 증빙: `docs/verification/auth-email-templates.png`.
- 실제 메일 발송·수신, Gmail/Outlook 등 메일 클라이언트별 렌더링, 인증 완료 흐름은 이번 템플릿 작업에서 검증하지 않았습니다.
- 대시보드 Preview는 템플릿 변수를 그대로 표시할 수 있습니다. 실제 발송 시 Supabase가 치환합니다.

공식 변수 설명: https://supabase.com/docs/guides/auth/auth-email-templates
