# QA Test Quality Review

기존 테스트 코드의 품질, 안정성, 패턴 준수 여부를 진단한다.

인자: `$ARGUMENTS` — 특정 디렉터리 (예: `e2e/browser/flows/`, `e2e/api/session/`) 또는 비어있으면 전체

---

## 0. Plan Mode 진입 (필수)

**리뷰를 시작하기 전에 반드시 `EnterPlanMode` 도구를 호출하여 plan mode에 진입해라.**

리뷰는 읽기 → 분석 → 보고 작업이다. 코드를 수정하는 것이 아니라 진단하는 것이다.

리뷰 보고가 완료된 후, 사용자가 수정을 요청하면 그때 `ExitPlanMode`로 나와서 수정을 진행해라.

---

## 1. 사전 준비

1. `.claude/qa-context.md` 읽기 — 테스트 인프라 규칙 파악
2. `e2e/constants.ts` 읽기 — TIMEOUTS 상수 확인
3. `e2e/fixtures/auth.fixture.ts` 읽기 — API 인증 패턴
4. `e2e/browser/fixtures/auth-browser.fixture.ts` 읽기 — 브라우저 인증 패턴

---

## 2. 리뷰 범위 결정

| 인자 | 검토 대상 |
|------|----------|
| (없음) | `e2e/` + `__tests__/` 전체 |
| `e2e/api/` | API 통합 테스트만 |
| `e2e/browser/` | 브라우저 테스트만 |
| `e2e/browser/flows/` | 플로우 테스트만 |
| `__tests__/` | 단위 테스트만 |
| 특정 파일 경로 | 해당 파일만 |

---

## 3. 검사 항목

### 3-1. 데이터 격리 & 정리

- [ ] 각 테스트/describe 블록이 `afterEach` 또는 `afterAll`에서 `cleanupTestData()` 호출하는가?
- [ ] 병렬 실행 시 충돌 가능한 하드코딩된 ID가 있는가? (`createTestContext()` 사용 권장)
- [ ] 테스트 간 순서 의존성이 있는가? (이전 테스트의 데이터에 의존)

### 3-2. Timeout 패턴

- [ ] 하드코딩된 timeout (`{ timeout: 10000 }`)이 있는가? → `TIMEOUTS` 상수 사용 권장
- [ ] `waitForTimeout(N)`이 있는가? → 명시적 조건 대기로 교체 권장
- [ ] 불필요하게 긴 timeout이 있는가?

### 3-3. Selector 안정성

- [ ] 텍스트 기반 선택자 (`getByText("제출하기")`)가 변경에 취약한가?
- [ ] `data-testid` 사용이 일관적인가?
- [ ] CSS 클래스 기반 선택자 (`.btn-primary`)가 있는가? → 불안정

### 3-4. 인증 패턴 준수

- [ ] API 테스트: `auth.fixture.ts`의 `instructorRequest`/`studentRequest` 사용하는가?
- [ ] 브라우저 테스트: `auth-browser.fixture.ts`의 `studentPage`/`instructorPage` 사용하는가?
- [ ] 인증 바이패스 로직을 테스트 내에서 직접 구현하고 있지 않은가?

### 3-5. DB 상태 검증

- [ ] UI 동작만 검증하고 DB 상태는 확인하지 않는 테스트가 있는가?
- [ ] `seed.ts`의 `getExam()`, `getSession()`, `getGrades()` 조회 헬퍼를 활용하는가?
- [ ] API 응답 body만 검증하고 실제 DB 반영은 확인하지 않는 경우?

### 3-6. Assertion 품질

- [ ] `expect(response.ok()).toBeTruthy()` 같은 약한 assertion이 있는가? → 상태 코드 명시 권장
- [ ] 빈 assertion 블록이 있는가? (테스트가 아무것도 검증하지 않음)
- [ ] 과도한 assertion이 구현 세부사항에 커플링되어 있는가?

### 3-7. Mock 서버 활용

- [ ] 외부 서비스 호출이 mock되지 않은 테스트가 있는가?
- [ ] `mockExternalRoutes(page)` 호출이 누락된 브라우저 테스트?
- [ ] Mock 서버의 에러 시뮬레이션 (`x-mock-error`)을 활용하는 에러 테스트가 있는가?

### 3-8. 코드 중복

- [ ] 여러 테스트 파일에서 동일한 seed 로직이 반복되는가?
- [ ] `test-data-builder.ts`의 시나리오 빌더를 활용할 수 있는데 직접 seed하는 경우?

---

## 4. 심각도 정의

### P0 — 테스트 안정성 위협
- 병렬 실행 시 확실히 충돌하는 패턴
- cleanup 누락으로 다른 테스트를 오염시키는 경우
- 거짓 양성(false positive): 항상 통과하지만 아무것도 검증하지 않는 테스트

### P1 — 유지보수성 저하
- 하드코딩된 timeout/selector로 flaky할 수 있는 패턴
- 기존 헬퍼/패턴을 활용하지 않아 코드 중복이 심한 경우
- 순서 의존성으로 독립 실행이 불가능한 테스트

### P2 이하 — 보고하지 않는다

---

## 5. 출력 형식

```
## QA Test Quality Report

**리뷰 범위**: [전체 / 특정 경로]
**리뷰 시각**: [현재 시각]
**검토 파일 수**: N개

---

### 발견된 이슈

#### [P0] 이슈 제목
- **파일**: `경로:라인번호`
- **문제**: 구체적 설명
- **영향**: 이 패턴이 왜 문제인지
- **수정 방안**: 구체적 코드 변경 제안

---

### 패턴 준수 현황

| 패턴 | 준수율 | 비고 |
|------|--------|------|
| afterEach cleanup | N/M | |
| TIMEOUTS 상수 사용 | N/M | |
| auth fixture 사용 | N/M | |
| createTestContext 사용 | N/M | |
| DB 상태 검증 | N/M | |

---

### 요약
- P0: N건
- P1: N건
- 전체 테스트 품질: [양호 / 주의 / 개선 필요]
```

---

## 6. 규칙

- 실제 파일을 읽고 확인한 결과만 보고한다.
- P0 최대 3개, P1 최대 5개. 채우려고 하지 않는다.
- "발견된 이슈 없음"은 유효한 결과다.
- 리뷰 완료 후 수정 여부를 사용자에게 물어본다.
- 안티패턴: 스타일/포매팅 이슈는 보고하지 않는다. 실제 안정성/유지보수성에 영향을 주는 것만.
