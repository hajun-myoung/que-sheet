# 큐 — 발표가 흐르는 곳

한국어 발표 운영·PDF 제출·심사 웹앱. Next.js 16 + TypeScript + Tailwind CSS 4 + PDF.js + Supabase(Auth/PostgreSQL/Storage/Realtime).

## 빠른 실행

Node.js 22.13 이상 권장(검증: Node 24.14.1).

```sh
npm ci
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 환경변수가 비어 있으면 **체험용 데모**가 실행됩니다. 로그인 화면에서 참여자·운영자·심사위원을 선택해 시험할 수 있습니다. 운영자와 심사위원은 데모 접속 버튼을, 참여자는 아래 코드를 사용하세요. `/?role=operator`, `/?role=judge`는 로그인 역할을 미리 선택하며 권한을 우회하지 않습니다.

- 참여자 첫 제출 체험: `CUE2026` (넥스트웨이브). 제출 완료 팀 체험: `READY2026` (루미너스). 처음 제출한 뒤 같은 코드로 접속하면 설문 대신 자기 팀 화면이 열립니다. 운영자가 해당 팀 코드를 재발급하면 기존 체험 코드는 무효화됩니다.
- 데모 로그인은 탭별 sessionStorage에 저장되어 여러 역할을 별도 탭에서 시험할 수 있습니다.
- 데모: localStorage에 상태, IndexedDB에 PDF, Web Locks로 동시 쓰기 직렬화, BroadcastChannel로 탭 간 동기화. 데모 역할 전환은 보안 인증이 아닙니다.
- 데모 데이터는 같은 브라우저·같은 origin에서만 공유됩니다. 실제 다른 기기에서 사용하려면 Supabase를 연결하세요.
- 샘플 PDF는 `public/sample.pdf`에 포함된 6장짜리 자체 제작 벡터 자료입니다. 재생성: `node scripts/create-sample.mjs`.
- 데모를 초기화할 때는 브라우저 사이트 데이터의 `cue-demo-v1`와 `cue-pdfs`를 지웁니다. 제출한 데모 파일도 삭제되므로 필요한 파일을 먼저 보관하세요.

## 실제 Supabase 연결

1. Supabase 프로젝트를 생성합니다. Project URL과 publishable key(또는 legacy anon key)를 확인합니다.
2. `.env.example`을 `.env.local`로 복사하고 다음 두 값을 입력합니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

이 두 값은 공개 클라이언트 설정입니다. **service_role/secret key는 여기에 넣지 않습니다.** `NEXT_PUBLIC_*` 값은 빌드 시 포함되므로 변경 후 재시작·재빌드가 필요합니다.

3. Supabase CLI를 설치하고 로그인한 뒤 프로젝트를 연결합니다.

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy submit-pdf --no-verify-jwt
```

마이그레이션은 시간순으로 `supabase/migrations/20261113130610_core.sql`, `supabase/migrations/20261113130628_participant_access.sql`입니다. 두 번째 파일은 팀 정보·참여 코드·원자적 설문 제출을 추가합니다. 세 번째 `20261113131412_access_query_indexes.sql`은 RLS 조회 최적화와 외래키 인덱스를 추가합니다. 기존 설치는 `supabase db push`로 새 파일만 적용하고 Edge Function도 다시 배포하세요. CLI 이력 관리가 권장되며 이미 적용한 파일을 수동 재실행하지 마세요.

`--no-verify-jwt`는 Edge gateway의 구형 JWT 검사만 끕니다. 함수 자체는 **매 요청마다 `auth.getUser()`로 Bearer 토큰을 검증**합니다. 공개 요청은 거부합니다. Supabase가 함수 런타임에 주입하는 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`를 사용합니다. service role 값은 브라우저·정적 호스팅 환경에 노출하면 안 됩니다.

4. Supabase Authentication에서 **Email provider와 Anonymous Sign-Ins를 활성화**하고 Site URL을 실제 프런트엔드 HTTPS URL로 설정합니다. Redirect URLs에 그 origin과 `http://localhost:3000`을 등록합니다. 초대 링크의 `/?invite=...`를 로그인 콜백에 보존하려면 배포 origin의 `/**` redirect 패턴도 등록하세요. 실제 초대 대상 이메일로 로그인 링크가 배달되도록 **커스텀 SMTP(host, port, 사용자명, 비밀번호, 발신 주소)**를 설정합니다. 기본 이메일 서비스의 발송 대상·횟수 제한은 프로젝트에서 확인해야 합니다.
   참여 코드 접속은 익명 Auth 세션을 만든 후 RPC가 해당 팀의 참여자 권한만 부여합니다. 익명 세션으로 운영자 행사를 생성할 수 없습니다. 코드 원문은 DB에 저장하지 않고 SHA-256 해시만 저장합니다. 익명 계정 생성의 프로젝트별 rate limit을 설정하세요. 코드 입력은 인증 사용자당 분당 10회로 제한하며, 새 익명 계정 생성까지 이 제한이 막는 것은 아닙니다. CAPTCHA를 활성화하려면 토큰 입력 연동을 추가해야 합니다(현재 UI는 CAPTCHA 토큰 흐름을 제공하지 않습니다).

5. `npm run dev`를 다시 시작합니다. 첫 사용자가 이메일 로그인 후 **행사 만들기**를 누르면 해당 행사의 운영자가 됩니다. 다른 행사에 대한 권한은 생기지 않습니다.
6. **행사 설정 → 팀·심사위원**에서 팀을 등록한 뒤 **참여 코드 발급**으로 팀별 코드를 발급·복사해 전달합니다. 코드는 7일 유효하며 누구든 소지하면 해당 팀 자료를 제출·열람할 수 있으므로 해당 팀에만 전달하세요. 원문은 발급 직후 화면에서만 확인하며 분실 시 새로 발급합니다. 재발급은 기존 코드의 새 접속을 막지만 이미 접속한 팀원의 권한을 해제하지 않습니다.
7. 같은 설정 화면에서 운영자·심사위원 초대를 만듭니다. 초대 링크를 복사해 전달합니다. 앱은 초대 이메일을 자동 발송하지 않습니다. 초대 이메일로 인증된 사용자만 수락할 수 있습니다. 심사위원이 수락한 뒤 팀을 배정하세요.

RLS, 비공개 `presentations` 버킷, Storage 읽기 정책, `event_updates` Realtime publication은 마이그레이션에 포함되어 있습니다. Dashboard에서 publication과 Realtime 연결을 확인하세요.

### 로컬 Supabase 개발

Docker와 Supabase CLI가 있으면 프로젝트 루트에서 `supabase start`를 실행합니다. **개발용 로컬 데이터만 있는 경우에 한해** `supabase db reset`으로 마이그레이션을 재적용할 수 있습니다. `supabase status`에서 로컬 URL/anon key를 확인해 `.env.local`에 넣고 `supabase functions serve submit-pdf --no-verify-jwt`를 실행합니다. 로그인 메일은 CLI가 출력하는 로컬 메일함 URL에서 확인합니다. 이 작업에서 Docker/Supabase 전체 스택은 실행하지 않았습니다.

## 배포

```sh
npm run build
npm start
```

정적 산출물은 `out/`입니다. `npm start`는 `serve out`으로 로컬 정적 배포본을 실행합니다. Next.js 서버 기능 대신 Supabase RPC와 Edge Function이 서버 권한·검증을 소유하므로 HTTPS 정적 호스팅에 `out/`를 배포할 수 있습니다. PDF worker는 `npm ci`의 postinstall로 `public/`에 복사됩니다. 프런트엔드와 Supabase 프로젝트를 같은 행사에 맞게 연결해야 합니다.

운영 호스트는 HTTPS, ES module MIME(`.mjs`), PDF·worker 전송을 지원해야 합니다. iframe에 넣을 경우 `allow="fullscreen"`과 호스트 Permissions-Policy를 확인하세요. 전체화면이 차단되더라도 발표 상태는 보존되고 재진입 버튼을 제공합니다. CDN이 worker 경로를 HTML로 fallback하지 않게 설정하세요.

## 파일 제한과 저장 안전성

- PDF, **20 MiB(20 × 1024 × 1024바이트)** 이하, **1~500페이지**, 암호 없는 파일만 허용합니다.
- 브라우저는 확장자·MIME·헤더·PDF.js 파싱·첫 페이지 연산을 검사합니다. Edge Function은 요청 스트림 상한을 적용하고 전체 파일을 pdf-lib로 파싱해 페이지 구조를 확인합니다. 클라이언트 검증만 신뢰하지 않습니다.
- 20 MiB는 Supabase Edge Function 메모리와 파일 파싱 비용을 고려한 기본값입니다. 프로젝트의 전역 Storage 파일 제한도 최소 20 MiB로 설정해야 합니다. 실제 배포 프록시·요금제 제한이 더 낮으면 브라우저·Edge·bucket 세 곳의 상한을 함께 낮추세요. 압축이 과도하거나 리소스가 매우 큰 PDF는 런타임 제한으로 실패할 수 있습니다.
- 원본은 비공개 Storage에 저장됩니다. 권한 검사 후 5분짜리 서명 URL로 읽습니다. 세션은 특정 PDF 버전을 참조합니다.
- 새 파일 저장·파싱이 성공한 뒤 DB에서 이전 제출 ID를 비교하고 교체합니다. 다른 탭이 먼저 교체했다면 덮어쓰지 않고 충돌을 반환합니다. 업로드 재시도는 요청 ID와 콘텐츠 해시로 중복을 처리합니다.
- 과거 제출본은 진행·종료된 세션과 연결되므로 자동 삭제하지 않습니다. 행사 종료 후 보존 기간에 맞는 백업·정리 정책을 운영자가 별도로 정해야 합니다. 함수가 중간 종료되면 참조되지 않은 업로드 객체가 남을 수 있으므로 이를 주기적으로 점검하세요.

## 사용자 흐름

- **운영자:** 팀 검색·순서 변경 → PDF 확인 → 발표 시작 → 첫 페이지 렌더 완료 후 타이머 시작 → 일시정지/재개/초기화/종료. 화면을 나가거나 전체화면을 해제해도 발표는 유지됩니다.
- **참여자:** 로그인 역할 선택 → 운영자가 발급한 코드 입력 → 첫 제출 전에는 독립 설문만 표시 → 팀명·PDF·팀장·팀원 입력 → 제출 성공 후 본인 팀 대시보드. 팀명·팀장은 필수, 팀원은 팀장 외 최대 30명(1인 팀은 생략). 팀 정보와 PDF 포인터는 하나의 DB 트랜잭션으로 확정합니다. 이후에는 본인 팀 PDF 교체·미리보기와 실제 활성 발표의 장표 이동을 사용할 수 있습니다.
- **발표 연습:** 제출 후 `발표 연습하기(n분)` → PDF·타이머 전체화면 → 장표 이동·일시정지·재개·초기화·종료. 실제 행사 세션·심사 현황에 영향을 주지 않습니다. 사용자·행사·팀별로 현재 탭 sessionStorage에 페이지와 시간을 보관하고 새로고침 후 `연습 이어하기`로 복원합니다. 연습은 로컬 시계 기준이며 다른 기기와 동기화되지 않습니다. 탭을 닫으면 연습 상태가 사라집니다.
- **심사위원:** 배정 팀 선택 → 심사 시작(평가 기준 고정) → 점수·비고 임시저장 → 최종 제출. 제출 뒤 읽기 전용. 운영자가 재작성을 허용하면 기존 점수와 기준으로 다시 작성합니다.
- **리모컨:** 표준 키보드형 USB/Bluetooth 리모컨의 ArrowRight/PageDown, ArrowLeft/PageUp을 지원합니다. 키를 길게 눌러 생기는 반복 입력은 무시합니다. 텍스트 입력·확인 대화상자 중에는 장표 단축키가 실행되지 않습니다.

## 상태와 데이터 소유권

상세 내용은 [아키텍처](docs/ARCHITECTURE.md), 실행한 검증과 현장 체크리스트는 [검증 결과](docs/VERIFICATION.md)를 참고하세요.

## 테스트

```sh
npm run typecheck
npm test
npm run build
deno check --config supabase/functions/submit-pdf/deno.json supabase/functions/submit-pdf/index.ts
```

`npm test`는 핵심 로직, 실제 PostgreSQL WASM 엔진(PGlite)에 마이그레이션을 적용한 RLS/RPC 테스트, 서버 PDF 파서를 검증합니다. 네트워크가 없어도 설치 후 실행됩니다.

실제 다중 연결 경합 테스트는 **별도 빈 PostgreSQL 클러스터/DB**에서만 실행합니다. fixture가 auth/storage/역할을 생성하므로 운영 Supabase나 기존 DB에 실행하지 마세요. DB명은 `cue_test_`로 시작해야 합니다.

```sh
createdb cue_test_validation
CUE_TEST_DATABASE_URL=postgresql://USER@localhost:5432/cue_test_validation \
  node --import tsx --test tests/concurrency.test.ts
```

같은 클러스터에 테스트 역할이 이미 존재하면 새 임시 클러스터를 만드세요. 기본 `npm test`에서는 URL을 제공하지 않은 다중 연결 테스트 한 개가 skip됩니다. 검증 시점별 실행 여부는 `docs/VERIFICATION.md`에 기록합니다.

## 변경 전 복구 지점

요청에 따라 구현에 앞서 기존 작업을 기능별 5개 커밋으로 보관했습니다. 전체 변경 전 기준은 `3c9275a`입니다. 이 커밋의 프런트엔드와 Edge 코드를 사용하면 기존 화면으로 복구할 수 있습니다. 새 DB 마이그레이션은 추가형이므로 롤백 시 팀·제출 데이터를 삭제하지 마세요.

이 실행 환경에서 기본 Turbopack 빌드는 로컬 포트 권한 오류가 발생했습니다. 동일 소스는 `npm run build -- --webpack`으로 검증할 수 있습니다.

## 실제 프로젝트 연결

`Academic Festival` (`nidalecwnnxlmxptibua`)에 연결했습니다. 이 작업 공간의 `.env.local`에는 Project URL과 publishable key만 있으며 Git에서 제외됩니다. 실제 연결 후에는 데모 역할 버튼과 `CUE2026` 같은 데모 코드가 적용되지 않습니다. 운영자 이메일 로그인 → 행사 생성 → 팀 등록 → 참여 코드 발급 순서로 시작하세요.

원격 최초 배포 시 Supabase가 발급한 migration version에 맞춰 기존 두 SQL 파일 이름을 정렬했습니다. SQL 내용은 그대로이며, `supabase db push`가 이미 설치된 테이블을 재생성하지 않도록 원격 이력과 이름을 맞춘 것입니다. 초기 데모 시절 파일 이름은 이전 Git 커밋에서 확인할 수 있습니다. 이후 원격 이력과 로컬 파일을 각각 수정하지 말고 함께 관리하세요.

### Google Workspace SMTP

[Supabase SMTP 설정](https://supabase.com/dashboard/project/nidalecwnnxlmxptibua/auth/smtp)에서 Custom SMTP를 활성화하고 아래 값을 입력합니다.

| 항목         | 값                                   |
| ------------ | ------------------------------------ |
| Sender email | 실제 Google Workspace 이메일         |
| Sender name  | 큐:시트                              |
| Host         | `smtp.gmail.com`                     |
| Port         | `587` (TLS)                          |
| Username     | Sender email과 같은 전체 이메일 주소 |
| Password     | 해당 Google 계정의 앱 비밀번호       |

앱 비밀번호는 2단계 인증을 켠 계정에서 직접 발급합니다. 학교 관리 정책에 따라 발급이 제한될 수 있으며, 이 경우 학교 관리자 승인이나 별도 SMTP 제공자가 필요합니다. 비밀번호는 Supabase에만 입력하고 저장소·채팅에 남기지 마세요. [Google SMTP 안내](https://knowledge.workspace.google.com/admin/gmail/send-email-from-a-printer-scanner-or-app), [앱 비밀번호 안내](https://support.google.com/accounts/answer/185833).

기본 Supabase 메일 서버는 프로젝트 단위 시간당 2통으로 제한되고 프로젝트 팀에 등록된 이메일로만 발송합니다. Custom SMTP를 저장한 뒤 [Auth Rate Limits](https://supabase.com/dashboard/project/nidalecwnnxlmxptibua/auth/rate-limits)에서 이메일 발송 한도를 확인하세요. `email rate limit exceeded`가 계속되면 기존 2통 제한이 남아 있는지 확인합니다. [Supabase SMTP 문서](https://supabase.com/docs/guides/auth/auth-smtp).

로컬 로그인용 [URL Configuration](https://supabase.com/dashboard/project/nidalecwnnxlmxptibua/auth/url-configuration)은 Site URL `http://localhost:3000`, Redirect URLs `http://localhost:3000/**`로 설정합니다. 실제 웹 호스팅 주소가 정해지면 HTTPS 주소를 추가하고 Site URL도 변경하세요.

## 행사 생성·삭제와 멤버 일괄 초대

운영 화면 상단에서 다른 행사를 만들거나 행사 이름을 확인하고 삭제할 수 있습니다. 진행 중 발표와 메일 발송 중 삭제는 서버에서 거절합니다. 삭제 후 Storage 정리가 실패하면 재시도 버튼이 표시됩니다. 계정 자체는 행사 삭제로 지워지지 않습니다.

행사 설정 → 팀 · 심사위원 → **멤버만 등록하기**로 수신자를 저장한 뒤 참여 코드 발급 카드의 **일괄 초대하기**를 사용하세요. 수신자별 상태를 저장하므로 새로고침·다중 탭에서 중복 발송을 방지합니다. 팀 코드로 접속하는 참여자와 이메일 인증이 필요한 운영자·심사위원의 링크를 구분합니다.

추가 마이그레이션: `20261113141221_event_lifecycle_and_invitations.sql`.

```sh
supabase db push
supabase functions deploy delete-event --no-verify-jwt
supabase functions deploy send-invitations --no-verify-jwt
```

두 함수는 내부에서 `auth.getUser()`와 행사 운영자 권한을 검증합니다. DB 삭제·발송 선점 RPC는 service_role 전용입니다. 메일용 SMTP 설정과 템플릿 편집·재배포 방법은 [초대 메일 안내](docs/INVITATION_EMAIL.md)를 참고하세요. 현재 `CUE_APP_URL`은 로컬 테스트 주소이며 외부 참여자에게 보내기 전에 공개 HTTPS 주소로 변경해야 합니다.
