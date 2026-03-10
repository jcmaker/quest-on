# QA Smart Regression Selector

`git diff` 분석을 통해 변경 사항에 영향받는 최소 테스트 셋을 도출하고 선택적으로 실행한다.

인자: `$ARGUMENTS` — 비교 기준 브랜치 (기본값: `main`)

---

## 0. 사전 준비

1. `.claude/qa-context.md` 읽기 — 테스트 인프라 구조 파악

---

## 1. 변경 사항 수집

```bash
# 기본: main 대비 변경
git diff main...HEAD --name-only

# 또는 인자로 지정된 브랜치 대비
git diff $ARGUMENTS...HEAD --name-only

# 스테이징되지 않은 변경도 포함
git diff --name-only
git diff --cached --name-only
```

변경된 파일 목록을 수집한다.

---

## 2. 영향 분석 매핑

변경된 파일 → 영향받는 테스트 매핑 규칙:

### 2-1. API 라우트 변경

| 변경 파일 | 영향받는 테스트 |
|----------|---------------|
| `app/api/exam/[examId]/start/route.ts` | `e2e/api/exam/lifecycle.spec.ts`, `e2e/browser/flows/instructor-exam.spec.ts` |
| `app/api/session/[sessionId]/grade/route.ts` | `e2e/api/session/grade.spec.ts`, `e2e/browser/flows/grade-to-report.spec.ts` |
| `app/api/supa/route.ts` | `e2e/api/supa/*.spec.ts`, 대부분의 브라우저 플로우 |
| `app/api/chat/route.ts` | `e2e/api/chat.spec.ts`, `e2e/browser/flows/student-exam.spec.ts` |

**규칙**: `app/api/{path}/route.ts` 변경 시 → `e2e/api/{path}` 하위 테스트 + 해당 API를 사용하는 브라우저 플로우

### 2-2. 공유 라이브러리 변경

| 변경 파일 | 영향 범위 |
|----------|----------|
| `lib/auth.ts` | **전체** 인증 관련 테스트 |
| `lib/openai.ts` | 모든 AI 관련 테스트 |
| `lib/api-response.ts` | 모든 API 테스트 |
| `lib/validations.ts` | 유효성 검증 단위 테스트 + API 테스트 |
| `lib/grading.ts` | 채점 관련 테스트 |
| `proxy.ts` | **전체** 테스트 (미들웨어) |

### 2-3. 페이지/컴포넌트 변경

| 변경 파일 | 영향받는 테스트 |
|----------|---------------|
| `app/(app)/exam/[code]/page.tsx` | `e2e/browser/flows/student-exam.spec.ts`, `full-exam-submission.spec.ts` |
| `components/exam/*.tsx` | 시험 관련 브라우저 플로우 테스트 |
| `components/instructor/*.tsx` | 강사 관련 브라우저 플로우 테스트 |

### 2-4. 테스트 인프라 변경

| 변경 파일 | 영향 범위 |
|----------|----------|
| `e2e/fixtures/**` | 해당 fixture를 사용하는 모든 테스트 |
| `e2e/helpers/**` | 해당 helper를 사용하는 모든 테스트 |
| `e2e/browser/pages/**` | 해당 Page Object를 사용하는 테스트 |
| `e2e/constants.ts` | **전체** E2E 테스트 |
| `e2e/playwright.config.ts` | **전체** E2E 테스트 |

### 2-5. 설정/의존성 변경

| 변경 파일 | 영향 범위 |
|----------|----------|
| `package.json` | **전체** 테스트 |
| `tsconfig.json` | **전체** 테스트 |
| `.env.test` | **전체** E2E 테스트 |

---

## 3. 테스트 셋 산출

### 영향 범위 판정

변경 파일 분석 결과를 종합하여:

- **FULL**: `lib/auth.ts`, `proxy.ts`, `package.json`, `e2e/playwright.config.ts` 등 핵심 변경 → 전체 테스트 실행 권장
- **PARTIAL**: 특정 도메인만 영향 → 해당 테스트만 선택
- **MINIMAL**: 테스트 파일 자체 변경 또는 단일 라우트 변경 → 변경된 테스트만

### import 체인 추적

변경된 파일을 import하는 파일을 재귀적으로 추적하여 영향받는 테스트를 찾는다:

```
Grep: import.*{변경된모듈명}
```

---

## 4. 실행 명령어 생성

### PARTIAL/MINIMAL인 경우

```bash
# API 테스트만 필요한 경우
npx playwright test e2e/api/session/grade.spec.ts e2e/api/exam/lifecycle.spec.ts --config=e2e/playwright.config.ts

# 브라우저 테스트만 필요한 경우
npx playwright test e2e/browser/flows/student-exam.spec.ts --config=e2e/playwright.config.ts

# 단위 테스트만 필요한 경우
npx vitest run __tests__/grading-helpers.test.ts
```

### FULL인 경우

```bash
npm test && npm run test:api && npm run test:browser
```

---

## 5. 출력 형식

```
## QA Regression Analysis

**분석 시각**: [현재 시각]
**비교 기준**: main...HEAD (또는 지정된 브랜치)
**변경 파일 수**: N개

---

### 변경된 파일

| 파일 | 유형 | 영향 범위 |
|------|------|----------|
| `app/api/...` | API 라우트 | 특정 |
| `lib/...` | 공유 라이브러리 | 넓음 |

---

### 영향받는 테스트

**판정**: FULL / PARTIAL / MINIMAL

| 테스트 | 이유 |
|--------|------|
| `e2e/api/session/grade.spec.ts` | grade route 변경 |
| `e2e/browser/flows/student-exam.spec.ts` | exam page 변경 |

---

### 실행 명령어

```bash
[복사 가능한 명령어]
```

실행하시겠습니까? (y/n)
```

---

## 6. 자동 실행

### 서버 상태 확인 & 자동 시작

테스트를 실행하기 전에 서버가 실행 중인지 확인하고, 내려가 있으면 자동으로 시작한다:

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

### 테스트 실행

분석 완료 후 도출된 테스트 셋을 **즉시 자동 실행**한다:

1. 도출된 명령어 실행
2. 결과 확인
3. 실패가 있으면 `/qa-analyze` 패턴으로 자동 분석 및 수정
4. 수정 후 재실행하여 검증
5. 수정 사항이 있으면 자동 커밋:
   ```bash
   git add {수정된 파일들}
   git commit -m "fix: resolve regression test failures (via qa-regression)"
   git push origin HEAD
   ```

---

## 7. 규칙

- 변경 사항이 없으면 "변경 없음 — 회귀 테스트 불필요"로 보고한다.
- 영향 범위 판단에 자신 없으면 넓은 범위를 선택한다 (안전 우선).
- 테스트 셋 도출 후 사용자 확인 없이 자동 실행한다. 결과만 보고한다.
- import 체인 추적 시 3단계까지만 추적한다 (너무 깊어지면 FULL로 판정).
