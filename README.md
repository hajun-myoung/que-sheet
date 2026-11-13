# 큐 — 발표가 흐르는 곳

한국어 발표 운영·PDF 제출·심사 웹앱. Next.js 16 + TypeScript + Tailwind CSS 4 + PDF.js + Supabase(Auth/PostgreSQL/Storage/Realtime).

## 빠른 실행

Node.js 22.13 이상 권장(검증: Node 24.14.1).

```sh
npm ci
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 환경변수가 비어 있으면 **체험용 데모**가 실행됩니다. 상단 역할 선택 또는 `/?role=participant`, `/?role=judge`를 새 탭에서 열어 운영·참여·심사를 시험할 수 있습니다.

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

마이그레이션은 `supabase/migrations/202611120001_core.sql`입니다. CLI 대신 SQL Editor에 이 파일 전체를 실행할 수도 있지만, 운영 변경은 CLI 이력 관리가 권장됩니다. 초기 설치용 마이그레이션이며 두 번 수동 실행하지 마세요.

`--no-verify-jwt`는 Edge gateway의 구형 JWT 검사만 끕니다. 함수 자체는 **매 요청마다 `auth.getUser()`로 Bearer 토큰을 검증**합니다. 공개 요청은 거부합니다. Supabase가 함수 런타임에 주입하는 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`를 사용합니다. service role 값은 브라우저·정적 호스팅 환경에 노출하면 안 됩니다.

4. Supabase Authentication에서 Email provider를 활성화하고 Site URL을 실제 프런트엔드 HTTPS URL로 설정합니다. Redirect URLs에 그 origin과 `http://localhost:3000`을 등록합니다. 초대 링크의 `/?invite=...`를 로그인 콜백에 보존하려면 배포 origin의 `/**` redirect 패턴도 등록하세요. 실제 초대 대상 이메일로 로그인 링크가 배달되도록 **커스텀 SMTP(host, port, 사용자명, 비밀번호, 발신 주소)**를 설정합니다. 기본 이메일 서비스의 발송 대상·횟수 제한은 프로젝트에서 확인해야 합니다.
5. `npm run dev`를 다시 시작합니다. 첫 사용자가 이메일 로그인 후 **행사 만들기**를 누르면 해당 행사의 운영자가 됩니다. 다른 행사에 대한 권한은 생기지 않습니다.
6. **행사 설정 → 팀·심사위원**에서 팀과 초대를 만듭니다. 초대 링크를 복사해 전달합니다. 앱은 초대 이메일을 자동 발송하지 않습니다. 초대 이메일로 인증된 사용자만 수락할 수 있습니다. 심사위원이 수락한 뒤 팀을 배정하세요.

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
- **참여자:** 본인 팀 PDF 제출·교체·미리보기. 본인 팀의 활성 발표에서만 이전/다음 장표 이동.
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

같은 클러스터에 테스트 역할이 이미 존재하면 새 임시 클러스터를 만드세요. 기본 `npm test`에서는 URL을 제공하지 않은 다중 연결 테스트 한 개가 skip됩니다. 이번 구현에서는 PostgreSQL 18 임시 클러스터를 따로 만들어 해당 테스트도 통과시켰습니다.
