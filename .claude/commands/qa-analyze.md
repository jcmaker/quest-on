# QA Test Failure Analyzer

테스트 실패를 분석하고 분류하여 수정 방안을 제시한다. 가능하면 직접 수정한다.

인자: `$ARGUMENTS`
- (없음): 로컬 `test-results/` 및 `playwright-report/` 분석
- `latest`: 최근 CI 실행 결과 분석 (`gh run list`)
- 특정 테스트 파일 경로: 해당 테스트만 실행 후 분석

---

## 0. 사전 준비

### 서버 상태 확인 & 자동 시작

테스트를 실행/재실행하기 전에 서버가 실행 중인지 확인하고, 내려가 있으면 자동으로 시작한다:

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

### 컨텍스트 로딩

1. `.claude/qa-context.md` 읽기 — 테스트 인프라 구조 파악

---

## 1. 실패 데이터 수집

### 1-1. 로컬 결과 (기본)

```bash
# Playwright 결과 확인
ls test-results/ 2>/dev/null
ls playwright-report/ 2>/dev/null

# Vitest 결과 (최근 실행)
npm test -- --reporter=json 2>/dev/null
```

결과가 없으면 테스트를 직접 실행:

```bash
# API 테스트
npm run test:api 2>&1 | tail -100

# 브라우저 테스트
npm run test:browser 2>&1 | tail -100

# 단위 테스트
npm test 2>&1 | tail -50
```

### 1-2. CI 결과 (`latest` 인자)

```bash
# 최근 CI 실행 확인
gh run list --limit 5

# 실패한 실행의 로그 확인
gh run view {run-id} --log-failed
```

### 1-3. 특정 테스트 (파일 경로 인자)

```bash
# 특정 테스트 실행
npx playwright test {파일} --config=e2e/playwright.config.ts 2>&1
```

---

## 2. 실패 분석 프로세스

각 실패에 대해 다음 순서로 분석:

### 2-1. 실패 메시지 파싱

- 에러 메시지, 스택 트레이스 읽기
- 어떤 assertion이 실패했는지 파악
- 스크린샷이 있으면 확인 (`test-results/{test}/screenshot.png`)

### 2-2. 관련 코드 읽기

- 실패한 테스트 코드 읽기
- 테스트 대상 소스 코드 읽기
- 관련 fixture, seed, Page Object 읽기

### 2-3. 최근 변경 사항 교차 분석

```bash
# 최근 커밋에서 변경된 파일
git log --oneline -10
git diff HEAD~5 --name-only
```

실패한 테스트와 관련된 파일이 최근 변경되었는가?

### 2-4. 분류

각 실패를 다음 4가지 중 하나로 분류:

| 분류 | 설명 | 수정 방법 |
|------|------|----------|
| **실제 버그** | 소스 코드의 버그로 인한 실패 | 소스 코드 수정 |
| **flaky 테스트** | 간헐적 실패 (타이밍, 비결정적) | 테스트 안정화 (대기 조건 개선, retry) |
| **인프라 이슈** | 서버 미실행, DB 연결 실패, 포트 충돌 | 인프라 설정 확인 |
| **테스트 업데이트 필요** | 소스 변경으로 테스트가 구식화 | 테스트 코드 수정 |

---

## 3. 수정 실행

### 모든 유형 자동 수정

- **테스트 업데이트 필요**: selector 변경, API 응답 형식 변경 → 테스트 코드 직접 수정
- **flaky 테스트**: `waitForTimeout` → 명시적 대기 조건으로 교체
- **인프라 이슈**: 에러 메시지 기반 해결 방법 제시 및 설정 수정
- **실제 버그**: 근본 원인을 파악하고 소스 코드를 직접 수정한다. 수정 후 관련 테스트를 재실행하여 검증한다.
- **대규모 리팩터링 필요**: 영향 범위 분석 후 단계적으로 수정한다.

### 수정 후 자동 커밋

수정 완료 후 자동 커밋:

```bash
git add {수정된 파일들}
git commit -m "fix: {수정 내용 요약} (via qa-analyze)"
git push origin HEAD
```

---

## 4. 출력 형식

```
## QA Test Failure Analysis

**분석 시각**: [현재 시각]
**분석 소스**: [로컬 결과 / CI #{run-id} / 직접 실행]
**전체 테스트**: N개
**성공**: N개 / **실패**: N개 / **스킵**: N개

---

### 실패 분석

#### 1. [분류: 실제 버그/flaky/인프라/업데이트 필요] — 테스트명
- **파일**: `경로:라인번호`
- **에러**: 에러 메시지 요약
- **원인**: 근본 원인 분석
- **관련 변경**: `git log`에서 확인한 관련 커밋 (있으면)
- **수정**: [직접 수정함 / 수정 방안 제안]

---

### 요약

| 분류 | 건수 | 자동 수정 | 수동 확인 필요 |
|------|------|----------|--------------|
| 실제 버그 | N | N | N |
| flaky 테스트 | N | N | N |
| 인프라 이슈 | N | N | N |
| 테스트 업데이트 | N | N | N |
```

---

## 5. 규칙

- 실패한 테스트만 분석한다. 성공한 테스트는 건드리지 않는다.
- 수정은 최소한으로 한다. 실패를 고치는 것 이상의 리팩터링을 하지 않는다.
- AI는 실제 버그 포함 모든 유형의 실패를 자율적으로 수정하고 커밋한다. 사용자 확인을 기다리지 않는다.
- 수정 후 반드시 관련 테스트를 재실행하여 수정이 유효한지 검증한다.
- flaky 분류는 증거 기반으로 한다 (같은 코드로 성공/실패가 반복되는 경우).
- 모든 테스트가 통과하면 "전체 통과 — 이슈 없음"으로 보고한다.
