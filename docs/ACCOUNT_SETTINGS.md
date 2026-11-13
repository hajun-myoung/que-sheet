# 계정 메뉴와 행사 운영 설정

## 사용 방법

- 우상단 프로필 아이콘에서 이메일, 현재 행사, 행사 전환 목록, 새 행사 만들기, 로그아웃을 확인합니다. 헤더의 새 행사 만들기도 유지됩니다.
- 팝오버는 바깥 클릭 또는 Escape로 닫힙니다. 행사 카드의 화살표를 누르면 접근 가능한 행사 목록이 열립니다.
- 행사 설정 → **일반 및 운영**에서 행사 이름, 운영자, 행사 삭제를 관리합니다.
- 운영자 추가는 이메일과 이름을 입력해 초대 링크를 만든 뒤 전달하는 방식입니다. 해당 이메일로 인증하고 수락해야 권한이 생깁니다. 이 버튼은 메일을 자동 발송하지 않습니다.
- 운영자 수정은 **해당 행사 내 표시 이름**을 변경합니다. 로그인 이메일이나 Google 프로필은 변경하지 않습니다.
- 운영자 제거는 해당 행사 멤버십만 제거합니다. Auth 계정과 다른 행사 권한은 유지합니다. 마지막 운영자는 제거할 수 없습니다. 본인 제거도 다른 운영자가 있는 경우에만 가능합니다.
- 대기 중 운영자 초대를 취소하면 기존 링크로 수락할 수 없습니다. 발송 중인 초대는 취소하지 못합니다.
- 행사 삭제는 기존 삭제 API를 사용합니다. 진행 중 발표가 없어야 하며 행사 이름을 정확히 입력해야 합니다.

## Google 이름

이메일 매직 링크 로그인은 Google 프로필 이름을 제공하지 않습니다. 현재는 이메일과 프로필 아이콘을 표시합니다. Google 인증 identity에 `full_name` 또는 `name`이 있으면 `{이름}님`을 표시하도록 준비했습니다. 이름은 표시 용도로만 사용하며 권한 판단에는 사용하지 않습니다.

Google 이름을 받으려면 별도 Google OAuth 연동이 필요합니다. Google Cloud OAuth 클라이언트, Supabase Google Provider 설정, 앱 Google 로그인 버튼과 redirect 설정을 추가해야 합니다. 이번 작업에서는 로그인 방식을 변경하지 않았습니다.

공식 문서: https://supabase.com/docs/guides/auth/social-login/auth-google

## DB와 배포

- 원격 프로젝트: `nidalecwnnxlmxptibua`.
- 적용 마이그레이션: `20261113151645_event_administration.sql`. 사용자 배포 승인 후 적용하고 원격 이력과 로컬 파일명을 맞췄습니다.
- 기존 `app_command`의 행사 잠금·역할 검사·중복 요청 영수증을 재사용합니다. 이름 수정에는 기존 값 비교를 추가해 다른 탭의 변경 덮어쓰기를 거절합니다.
- 초대 수락도 행사 → 초대 순서로 잠가 초대 취소, 운영자 제거, 행사 삭제와 일관된 순서로 처리합니다.
- 새 테이블, 사용자 직접 쓰기 권한, anon RPC 실행 권한은 추가하지 않았습니다. `app_command`와 `accept_invitation`은 기존처럼 authenticated만 실행할 수 있고, 내부에서 행사 역할 또는 인증된 초대 이메일을 검증합니다.
- 서버 기능은 기존 클라이언트에 추가적으로 제공됩니다. UI Git 롤백은 원격 DB를 되돌리지 않습니다. DB 롤백이 필요하면 전체 과거 마이그레이션을 재실행하지 말고 이전 두 함수 정의를 복원하는 새 마이그레이션을 사용해야 합니다.

## 검증 — 2026-11-14 KST

- `npm run typecheck`, `npm run build -- --webpack` 통과.
- 전용 임시 PostgreSQL 18에서 전체 **32개 테스트 통과, skip 없음**.
- 신규 검증: 행사 이름 범위·형식, 오래된 값 충돌, 중복 요청, 외부인·심사위원 수정 거절, 직접 테이블 쓰기 거절, 운영자 초대 수락·수정·제거, 제거 후 접근 차단, 마지막 운영자 보호, 취소된 초대 재사용 거절, 행사 간 대상 격리, 발송 중 취소 차단.
- 실제 동시 요청: 운영자 2명의 동시 본인 제거는 하나만 성공하며 한 명이 남습니다. 초대 수락과 취소도 하나만 성공합니다.
- 실제 Safari/로그인 계정: 팝오버 이메일과 행사 목록, 행사 전환, 팝오버의 새 행사 대화상자, Escape 닫기, 일반 및 운영 탭, 마지막 운영자 제거 버튼 비활성화, 삭제 이름 확인·취소를 검증했습니다.
- 기존 값을 유지한 행사 이름 저장·운영자 표시 이름 저장을 실행해 성공 안내와 원격 요청 영수증을 확인했습니다. 사용자 행사와 운영자 계정은 삭제하지 않았습니다.
- [계정 팝오버](screenshots/account-popover.png), [일반 및 운영](screenshots/general-settings.png).
- 실제 운영자 초대 메일 발송, 별도 계정 수락, Google 로그인 이름 수신, 모바일 실기기 검증은 이번 브라우저 확인에 포함하지 않았습니다. 초대 수락/권한 제거의 서버 동작은 자동 테스트로 검증했습니다.

보안 진단의 기존 [SECURITY DEFINER 경고](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)는 권한 검사를 수행하는 RPC 구조 때문에 남습니다. 실행 권한과 행사별 검증을 확인했습니다. [익명 로그인 정책 경고](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins)는 참여 코드 로그인 지원, [정책 없음 INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)는 서버 전용 테이블의 직접 접근 차단입니다. [유출 비밀번호 보호](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)는 기존 미설정 상태이며 이번 변경에서 인증 설정은 수정하지 않았습니다.
