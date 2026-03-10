# QA Test Generator

지정된 소스 파일에 대한 테스트 코드를 생성한다. 기존 테스트 패턴을 엄격히 준수한다.

인자: `$ARGUMENTS` — 테스트 대상 파일 경로 (예: `app/api/feedback/route.ts`, `app/(app)/student/page.tsx`)

---

## 0. 사전 준비

1. `.claude/qa-context.md` 읽기 — 테스트 인프라 규칙 파악
2. 대상 파일 (`$ARGUMENTS`) 읽기 — 어떤 기능을 테스트해야 하는지 파악
3. 관련 기존 테스트 파일 읽기 — 패턴 참조

---

## 1. 테스트 유형 결정

| 대상 경로 | 테스트 유형 | 테스트 위치 |
|----------|-----------|-----------|
| `app/api/**` | API 통합 테스트 | `e2e/api/{domain}/{feature}.spec.ts` |
| `app/(app)/**` | 브라우저 E2E 테스트 | `e2e/browser/flows/{flow}.spec.ts` |
| `lib/**` | 단위 테스트 | `__tests__/{feature}.test.ts` |
| `components/**` | 브라우저 E2E 테스트 | `e2e/browser/flows/{flow}.spec.ts` 또는 `e2e/browser/{feature}.spec.ts` |

---

## 2. API 테스트 생성 규칙

### 필수 패턴

```typescript
import { test, expect } from "../../fixtures/auth.fixture";
import { seedExam, seedSession, cleanupTestData } from "../../helpers/seed";
import { createTestContext } from "../../helpers/test-context";

test.describe("기능명", () => {
  // 병렬 안전을 위한 고유 컨텍스트
  const ctx = createTestContext();

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("성공 케이스 - 설명", async ({ instructorRequest }) => {
    // Arrange: seed 데이터
    const exam = await seedExam({ instructor_id: ctx.instructorId });
    // Act: API 호출
    const res = await instructorRequest.post(`/api/...`, { data: { ... } });
    // Assert: 응답 + DB 상태
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  test("인증 실패 - 미인증 사용자 차단", async ({ anonRequest }) => {
    const res = await anonRequest.post(`/api/...`);
    expect(res.status()).toBe(401);
  });

  test("권한 실패 - 다른 역할 차단", async ({ studentRequest }) => {
    // instructor-only 라우트를 student로 접근
    const res = await studentRequest.post(`/api/...`);
    expect(res.status()).toBe(403);
  });

  test("유효성 검증 - 잘못된 입력", async ({ instructorRequest }) => {
    const res = await instructorRequest.post(`/api/...`, { data: {} });
    expect(res.status()).toBe(400);
  });
});
```

### 체크리스트

- [ ] `auth.fixture.ts`에서 import (`instructorRequest`, `studentRequest`, `adminRequest`, `anonRequest`)
- [ ] `createTestContext()` 사용하여 ID 고유화
- [ ] `afterEach`에서 `cleanupTestData()` 호출
- [ ] 각 HTTP 메서드별 테스트
- [ ] 성공 케이스 + 인증 실패 + 권한 실패 + 유효성 검증 케이스
- [ ] 응답 body 검증 + 필요시 DB 상태 검증 (`getExam()`, `getSession()` 등)

---

## 3. 브라우저 테스트 생성 규칙

### 필수 패턴

```typescript
import { test, expect } from "../fixtures/auth-browser.fixture";
import { seedStudentExamScenario, cleanupTestData } from "../helpers/test-data-builder";
import { TIMEOUTS, BASE_URL } from "../../constants";

test.describe("플로우명", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("시나리오 설명", async ({ studentPage }) => {
    // Arrange
    const { exam } = await seedStudentExamScenario({ examStatus: "running" });

    // Act
    await studentPage.goto(`${BASE_URL}/exam/${exam.code}`);
    await studentPage.waitForSelector("[data-testid='exam-container']", {
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    // Assert
    await expect(studentPage.locator("[data-testid='exam-title']")).toBeVisible();
  });
});
```

### Page Object 필요 시

1. `e2e/browser/pages/` 디렉터리에 PascalCase 파일 생성
2. `e2e/browser/pages/index.ts`에서 re-export 추가
3. Page Object에 페이지 탐색, 요소 접근, 액션을 캡슐화

### 체크리스트

- [ ] `auth-browser.fixture.ts`에서 import (`studentPage`, `instructorPage`, `adminPage`)
- [ ] `test-data-builder.ts`의 시나리오 빌더 활용
- [ ] `afterEach`에서 `cleanupTestData()` 호출
- [ ] `TIMEOUTS` 상수 사용 (하드코딩 timeout 금지)
- [ ] `BASE_URL` 상수 사용
- [ ] `data-testid` 기반 selector 우선
- [ ] `mockExternalRoutes`는 fixture에서 자동 처리됨 — 별도 호출 불필요

---

## 4. 단위 테스트 생성 규칙

### 필수 패턴

```typescript
import { describe, it, expect } from "vitest";

describe("기능명", () => {
  it("동작 설명", () => {
    // Arrange → Act → Assert
  });
});
```

### 체크리스트

- [ ] Vitest 사용 (`import { describe, it, expect } from "vitest"`)
- [ ] 외부 의존성 mock (`vi.mock`)
- [ ] 엣지 케이스 포함 (빈값, null, 경계값)

---

## 5. 생성 프로세스

1. 대상 파일 분석 → 어떤 기능/엔드포인트를 테스트해야 하는지 목록화
2. 기존 유사 테스트 파일 참조 → 패턴 일관성 확보
3. 테스트 파일 작성 → 위 규칙 엄격 준수
4. 커버리지 체크리스트 출력 → 어떤 케이스가 커버되었는지 요약

---

## 6. 출력

### 생성된 파일

- 테스트 파일을 실제로 작성한다 (Write 도구 사용)
- 새 Page Object가 필요한 경우 함께 생성하고 index.ts에 추가

### 커버리지 체크리스트

```
## 생성된 테스트 커버리지

**대상**: `$ARGUMENTS`
**생성 파일**: `e2e/api/...` 또는 `e2e/browser/...`

| 케이스 | 상태 |
|--------|------|
| 성공 - 정상 요청 | ✅ |
| 인증 실패 - 미인증 | ✅ |
| 권한 실패 - 다른 역할 | ✅ |
| 유효성 검증 실패 | ✅ |
| 엣지 케이스 - ... | ✅ |
```

---

## 7. 자동 검증 & 커밋

테스트 생성 후 반드시 다음을 수행:

### 서버 상태 확인 & 자동 시작 (Playwright 테스트인 경우)

Playwright 테스트를 실행하기 전에 서버가 실행 중인지 확인하고, 내려가 있으면 자동으로 시작한다:

```bash
# dev 서버 확인
curl -sf http://localhost:3000/api/health > /dev/null 2>&1
# mock 서버 확인
curl -sf http://localhost:4010/health > /dev/null 2>&1
```

서버가 내려가 있으면:
1. `npm run dev` — 백그라운드로 dev 서버 시작 (Bash tool의 run_in_background 사용)
2. `npx tsx scripts/start-mock-server.ts` — 백그라운드로 mock 서버 시작 (run_in_background 사용)
3. health check로 준비 완료 대기:
   ```bash
   for i in $(seq 1 40); do curl -sf http://localhost:3000/api/health > /dev/null 2>&1 && break; sleep 1; done
   for i in $(seq 1 15); do curl -sf http://localhost:4010/health > /dev/null 2>&1 && break; sleep 1; done
   ```

1. **실행 검증**: `npx playwright test {파일} --config=e2e/playwright.config.ts` 또는 `npx vitest run {파일}`로 테스트가 통과하는지 확인
2. **통과 시 자동 커밋**:
   ```bash
   git add {생성된 파일들}
   git commit -m "test: add {대상} tests via qa-generate"
   ```
3. **자동 푸시**: `git push origin HEAD`
4. **실패 시**: 에러를 분석하고 수정한 뒤 재실행. 3회 시도 후에도 실패하면 결과를 보고하고 중단.

---

## 8. 규칙

- 기존 테스트 파일이 있으면 덮어쓰지 않고 사용자에게 알린다.
- 테스트가 실행 가능한 상태로 생성한다 (import 경로, 타입 정확성).
- AI는 테스트 생성, 검증, 커밋, 푸시를 자율적으로 수행한다. 사용자 확인을 기다리지 않는다.
- 판단에 자신 있으면 즉시 행동한다.
