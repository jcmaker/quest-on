# Quest-On QA Context

모든 QA 에이전트가 참조하는 공유 컨텍스트 문서. 테스트 인프라, 패턴, 규칙을 정리한다.

---

## 테스트 인프라 구조

### 디렉터리 레이아웃

```
e2e/
├── playwright.config.ts          # 3개 프로젝트: api-integration, browser-e2e, browser-flows
├── constants.ts                  # TEST_IDS, TIMEOUTS, BASE_URL
├── global-setup.ts               # Mock 서버 시작, DB 정리
├── global-teardown.ts            # 정리
├── fixtures/
│   └── auth.fixture.ts           # API 테스트용: instructorRequest, studentRequest, adminRequest, anonRequest
├── helpers/
│   ├── seed.ts                   # seedExam, seedSession, seedSubmission, seedMessage, seedGrade, seedStudentProfile, seedExamNode, cleanupTestData
│   ├── test-context.ts           # createTestContext() → 병렬 테스트용 고유 ID 생성
│   └── supabase-test-client.ts   # 테스트 전용 Supabase 클라이언트
├── api/                          # API 통합 테스트 (*.spec.ts)
│   ├── admin/
│   ├── ai/
│   ├── auth/
│   ├── exam/
│   ├── instructor/
│   ├── log/
│   ├── session/
│   ├── student/
│   ├── supa/
│   ├── universities/
│   └── upload/
└── browser/
    ├── fixtures/
    │   └── auth-browser.fixture.ts  # 브라우저 테스트용: studentPage, instructorPage, adminPage
    ├── helpers/
    │   ├── mock-routes.ts           # mockExternalRoutes() — Clerk, Supabase, Vercel 등 외부 서비스 차단
    │   └── test-data-builder.ts     # seedStudentExamScenario, seedInstructorGradingScenario, seedCompletedExamScenario, seedMultiStudentExamScenario
    ├── pages/                       # Page Object 모델
    │   ├── index.ts                 # re-export
    │   ├── StudentExamPage.ts
    │   ├── InstructorCreateExamPage.ts
    │   ├── InstructorEditExamPage.ts
    │   ├── InstructorGradePage.ts
    │   ├── OnboardingPage.ts
    │   ├── ProfileSetupPage.ts
    │   ├── StudentJoinPage.ts
    │   ├── AdminLoginPage.ts
    │   ├── StudentDashboardPage.ts
    │   ├── StudentReportPage.ts
    │   ├── InstructorDashboardPage.ts
    │   └── AdminDashboardPage.ts
    ├── flows/                       # 브라우저 플로우 테스트 (순차 실행)
    └── *.spec.ts                    # 개별 브라우저 테스트
__tests__/                           # Vitest 단위 테스트
```

### 테스트 실행 명령어

| 명령어 | 설명 |
|--------|------|
| `npm test` | Vitest 단위 테스트 (16개) |
| `npm run test:api` | Playwright API 통합 테스트 (병렬, workers=2/4) |
| `npm run test:e2e` | Playwright 브라우저 테스트 (flows 제외) |
| `npm run test:browser` | Playwright 브라우저 테스트 (flows 포함) |
| `npm run mock-server` | Mock OpenAI 서버 (포트 4010) |

### Playwright 프로젝트 설정

- **api-integration**: `fullyParallel: true`, workers 2 (CI에서 4)
- **browser-e2e**: `workers: 1`, `testIgnore: ["**/flows/**"]`
- **browser-flows**: `workers: 1`, flows 디렉터리만

---

## 인증 바이패스 패턴

### API 테스트 (헤더 기반)

```typescript
// e2e/fixtures/auth.fixture.ts
extraHTTPHeaders: {
  "x-test-user-id": "test-instructor-id",    // 또는 "test-student-id"
  "x-test-user-role": "instructor",           // 또는 "student"
  "x-test-bypass-token": BYPASS_SECRET,       // process.env.TEST_BYPASS_SECRET
  Accept: "application/json",
}
```

### 브라우저 테스트 (쿠키 + 헤더 기반)

```typescript
// e2e/browser/fixtures/auth-browser.fixture.ts
// 쿠키 설정:
{ name: "__test_bypass", value: BYPASS_SECRET }
{ name: "__test_user", value: encodeURIComponent(JSON.stringify(user)) }
{ name: "__test_user_role", value: "student" | "instructor" }

// API 요청 인터셉트로 헤더 주입:
page.route("**/api/**", route => route.continue({
  headers: { ...headers, "x-test-user-id": user.id, "x-test-user-role": role, "x-test-bypass-token": secret }
}));
```

### Admin 인증

```typescript
// HMAC-signed token 기반
Cookie: `admin-session=${token}`
// createTestAdminToken(): ADMIN_SESSION_SECRET 환경변수 필요
```

### 테스트 사용자 객체

```typescript
const TEST_STUDENT = { id: "test-student-id", unsafeMetadata: { role: "student" } };
const TEST_INSTRUCTOR = { id: "test-instructor-id", unsafeMetadata: { role: "instructor" } };
```

---

## Mock 서버 라우팅

Mock 서버 (`scripts/start-mock-server.ts`, 포트 4010)는 시스템 프롬프트 키워드로 응답을 분기한다:

| 키워드 | 용도 | 응답 |
|--------|------|------|
| `편집 어시스턴트` | 문제 수정 (adjust-question) | `{ questionText, explanation }` |
| `전문 교육가` | 요약 생성 (generate-summary) | `{ sentiment, summary, strengths, weaknesses, keyQuotes }` |
| `전문 평가위원` | 자동 채점 (auto-grade) | `{ chat_score, answer_score, overall_comment, ... }` |
| (기본값) | 문제 생성 | `{ questions, suggestedRubric }` |
| (non-JSON mode) | 채점/피드백 | `{ score, comment, stage_grading }` |

**에러 시뮬레이션**: `x-mock-error` 헤더로 `rate_limit`, `server_error`, `timeout`, `malformed` 시뮬레이션 가능.

---

## 데이터 시딩 함수

### 기본 시드 (`e2e/helpers/seed.ts`)

| 함수 | 시그니처 |
|------|---------|
| `seedExam(overrides?)` | `{ id, title, code, status, instructor_id, duration, questions, rubric, started_at, open_at, close_at, allow_draft_in_waiting, allow_chat_in_waiting }` |
| `seedSession(examId, studentId, overrides?)` | `{ id, status, started_at, submitted_at, preflight_accepted_at, attempt_timer_started_at, auto_submitted }` |
| `seedSubmission(sessionId, qIdx, overrides?)` | `{ id, answer }` |
| `seedMessage(sessionId, qIdx, overrides?)` | `{ id, role, content, response_id, message_type }` |
| `seedGrade(sessionId, qIdx, score, comment?, gradeType?)` | — |
| `seedStudentProfile(studentId, overrides?)` | `{ name, student_number, school }` |
| `seedExamNode(overrides?)` | `{ id, kind, name, parent_id, instructor_id, exam_id, sort_order }` |
| `cleanupTestData()` | FK 순서대로 전체 삭제 |
| `getExam(examId)` / `getSession(sessionId)` / `getSessionsByExam(examId)` / `getGrades(sessionId)` | 조회 헬퍼 |

### 시나리오 빌더 (`e2e/browser/helpers/test-data-builder.ts`)

| 함수 | 용도 |
|------|------|
| `seedStudentExamScenario(opts?)` | 학생 시험 시나리오 (exam + profile + session + optional submissions/grades/messages) |
| `seedInstructorGradingScenario(opts?)` | 채점 시나리오 (exam + N students with submissions) |
| `seedCompletedExamScenario()` | 완료된 시험 (submitted + graded) |
| `seedMultiStudentExamScenario(opts?)` | 여러 학생 다양한 상태 |

### 병렬 테스트 격리 (`e2e/helpers/test-context.ts`)

```typescript
const ctx = createTestContext();
// ctx.instructorId = "test-instructor-{random}"
// ctx.studentId = "test-student-{random}"
// ctx.suffix = "{random}"
```

---

## 한국어 UI 텍스트 패턴

테스트에서 자주 사용되는 한국어 텍스트:

- 시험 관련: "시험 시작 전 안내사항", "제출하기", "시험 종료", "다음 문제", "이전 문제"
- 채점 관련: "채점", "AI 채점", "수동 채점", "채점 결과"
- 대시보드: "진행 중인 시험", "완료된 시험", "시험 관리"
- 인증: "로그인", "로그아웃"

---

## 파일 네이밍 규칙

- API 테스트: `e2e/api/{domain}/{feature}.spec.ts` (예: `e2e/api/session/grade.spec.ts`)
- 브라우저 테스트: `e2e/browser/flows/{flow-name}.spec.ts` (예: `e2e/browser/flows/student-exam.spec.ts`)
- 브라우저 스모크: `e2e/browser/{type}.spec.ts` (예: `e2e/browser/smoke-auth-pages.spec.ts`)
- Page Object: `e2e/browser/pages/{PageName}.ts` (PascalCase)
- 단위 테스트: `__tests__/{feature}.test.ts`

---

## 5대 핵심 플로우

1. **학생 시험 응시**: 입장 → 사전 안내 → 문제 풀기(채팅+작성) → 제출
2. **강사 시험 관리**: 시험 생성 → 문제 설정 → 시험 시작/종료
3. **채점 플로우**: AI 자동 채점 → 수동 조정 → 최종 성적
4. **학생 리포트**: 채점 결과 → 피드백 확인 → AI 피드백 채팅
5. **관리자 대시보드**: 로그인 → 사용자 관리 → 로그 확인

---

## 테스트 상수 (`e2e/constants.ts`)

```typescript
TEST_IDS = { INSTRUCTOR: "test-instructor-id", STUDENT: "test-student-id" }
TIMEOUTS = { PAGE_LOAD: 15000, ELEMENT_VISIBLE: 10000, API_RESPONSE: 5000, DB_POLL: 5000, DB_POLL_INTERVAL: 500 }
BASE_URL = "http://localhost:3000"
```

---

## API 라우트 전체 목록 (41개)

### 인증 관련 (3개)
- `app/api/admin/auth/route.ts` — Admin 로그인
- `app/api/auth/revoke-other-sessions/route.ts` — 세션 해지
- `app/api/health/route.ts` — 헬스체크

### 시험 관련 (5개)
- `app/api/exam/[examId]/start/route.ts` — 시험 시작
- `app/api/exam/[examId]/end/route.ts` — 시험 종료
- `app/api/exam/[examId]/sessions/route.ts` — 세션 목록
- `app/api/exam/[examId]/final-grades/route.ts` — 최종 성적
- `app/api/exam/[examId]/live-messages/route.ts` — 실시간 메시지

### 세션 관련 (4개)
- `app/api/session/[sessionId]/route.ts` — 세션 상세
- `app/api/session/[sessionId]/grade/route.ts` — 채점
- `app/api/session/[sessionId]/preflight/route.ts` — 사전 안내
- `app/api/session/[sessionId]/live-messages/route.ts` — 실시간 메시지

### AI 관련 (5개)
- `app/api/ai/generate-questions/route.ts` — 문제 생성
- `app/api/ai/generate-questions-stream/route.ts` — 문제 생성 (스트림)
- `app/api/ai/generate-rubric/route.ts` — 루브릭 생성
- `app/api/ai/adjust-question/route.ts` — 문제 수정
- `app/api/chat/stream/route.ts` — 채팅 스트림

### 채팅/피드백 (4개)
- `app/api/chat/route.ts` — 학생 채팅
- `app/api/feedback/route.ts` — 피드백
- `app/api/feedback-chat/route.ts` — 피드백 채팅
- `app/api/instructor/chat/route.ts` — 강사 채팅

### 학생 관련 (5개)
- `app/api/student/profile/route.ts` — 프로필
- `app/api/student/sessions/route.ts` — 세션 목록
- `app/api/student/sessions/stats/route.ts` — 통계
- `app/api/student/session/[sessionId]/report/route.ts` — 리포트
- `app/api/log/paste/route.ts` — 붙여넣기 로그

### 강사 관련 (2개)
- `app/api/instructor/generate-summary/route.ts` — 요약 생성
- `app/api/instructor/chat/route.ts` — 강사 채팅

### 관리자 관련 (5개)
- `app/api/admin/users/route.ts` — 사용자 목록
- `app/api/admin/users/[userId]/route.ts` — 사용자 상세
- `app/api/admin/logs/route.ts` — 로그
- `app/api/admin/ai-usage/summary/route.ts` — AI 사용량 요약
- `app/api/admin/ai-usage/breakdown/route.ts` — AI 사용량 상세
- `app/api/admin/ai-usage/events/route.ts` — AI 사용 이벤트

### 기타 (6개)
- `app/api/supa/route.ts` — Supabase 프록시 (메인 CRUD)
- `app/api/analytics/exam/[examId]/overview/route.ts` — 분석
- `app/api/universities/search/route.ts` — 대학 검색
- `app/api/upload/route.ts` — 파일 업로드
- `app/api/upload/signed-url/route.ts` — 서명된 URL
- `app/api/embed/route.ts` — 임베딩
- `app/api/extract-text/route.ts` — 텍스트 추출
- `app/api/search-materials/route.ts` — 자료 검색
