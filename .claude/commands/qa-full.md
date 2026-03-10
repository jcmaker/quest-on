# QA Full Pipeline Orchestrator

전체 QA 파이프라인을 한 번에 실행하는 마스터 커맨드. Subagent를 병렬 디스패치하여 효율화한다.

---

## 0. 사전 검사

### 서버 상태 확인 & 자동 시작

```bash
# dev 서버 확인
curl -sf http://localhost:3000/api/health > /dev/null 2>&1

# mock 서버 확인
curl -sf http://localhost:4010/health > /dev/null 2>&1
```

서버가 실행 중이 아닌 경우, **자동으로 시작한다** (사용자에게 묻지 않는다):

1. dev 서버가 내려가 있으면:
   ```bash
   # 백그라운드로 dev 서버 시작 (Bash tool의 run_in_background 사용)
   npm run dev
   ```
2. mock 서버가 내려가 있으면:
   ```bash
   # 백그라운드로 mock 서버 시작 (Bash tool의 run_in_background 사용)
   # 주의: tsx가 글로벌 설치되지 않았을 수 있으므로 npx 사용
   npx tsx scripts/start-mock-server.ts
   ```
3. 서버 시작 후 health check로 준비 완료를 확인한다 (두 서버를 **병렬로** 대기):
   ```bash
   # 최대 40초 대기 (dev 서버는 빌드 시간이 필요)
   for i in $(seq 1 40); do curl -sf http://localhost:3000/api/health > /dev/null 2>&1 && echo "DEV_SERVER: UP" && break; sleep 1; done
   # 최대 15초 대기
   for i in $(seq 1 15); do curl -sf http://localhost:4010/health > /dev/null 2>&1 && echo "MOCK_SERVER: UP" && break; sleep 1; done
   ```
4. 서버 자동 시작을 사용자에게 알린다 (예: "dev 서버와 mock 서버를 자동으로 시작했습니다").
5. 서버 없이도 실행 가능한 분석(커버리지, 리뷰, 회귀 분석)은 서버 준비를 기다리는 동안 병렬로 진행한다.

---

## 1. Phase 1 — 병렬 정적 분석 (Subagent)

3개의 Subagent를 **동시에** 디스패치:

### Agent 1: 커버리지 갭 분석
```
Agent(description="QA coverage gap analysis"):
  1. `.claude/qa-context.md` 읽기
  2. `app/api/**/route.ts` 전체 스캔
  3. `e2e/**/*.spec.ts` 매핑
  4. 미테스트 라우트 우선순위화
  5. 결과 리포트 반환
```

### Agent 2: 테스트 품질 리뷰
```
Agent(description="QA test quality review"):
  1. `.claude/qa-context.md` 읽기
  2. `e2e/` + `__tests__/` 전체 검토
  3. cleanup 패턴, timeout, selector 안정성 검사
  4. P0/P1 이슈 리포트 반환
```

### Agent 3: 회귀 분석
```
Agent(description="QA regression analysis"):
  1. `git diff main...HEAD --name-only`
  2. 변경 파일 → 영향받는 테스트 매핑
  3. 최소 테스트 셋 도출
  4. 실행 명령어 반환
```

---

## 2. Phase 2 — 테스트 실행

### 2-1. 단위 테스트 실행

```bash
npm test 2>&1
```

### 2-2. API 통합 테스트 실행

```bash
npm run test:api 2>&1
```

### 2-3. 브라우저 E2E 테스트 실행 (서버 필요)

서버가 실행 중인 경우에만:

```bash
npm run test:browser 2>&1
```

### 2-4. 실패 시 자동 분석

테스트 실패가 있으면:
```
Agent(description="QA failure analysis"):
  - 실패한 테스트 코드 + 소스 코드 읽기
  - git log 교차 분석
  - 분류: 실제 버그 / flaky / 인프라 / 테스트 업데이트 필요
  - 수정 방안 제시
```

---

## 3. Phase 3 — 탐색적 테스팅 (서버 필요, 선택적)

서버가 실행 중이고 Playwright MCP가 사용 가능한 경우에만:

주요 플로우 중 하나를 탐색:
- 최근 변경이 가장 많은 영역 우선
- Phase 1의 회귀 분석 결과 참조

---

## 4. 종합 리포트 생성

모든 Phase 결과를 취합하여 단일 리포트:

```
## QA Full Pipeline Report

**실행 시각**: [현재 시각]
**실행 환경**: dev 서버 [✅/❌] | mock 서버 [✅/❌]

---

### 1. 커버리지 분석 요약

| 영역 | 전체 | 테스트됨 | 커버리지 |
|------|------|---------|---------|
| API 라우트 | N | N | N% |
| 페이지 | N | N | N% |
| 핵심 플로우 | 5 | N | N/5 |

**가장 시급한 갭**: [미테스트 라우트 상위 3개]

---

### 2. 테스트 품질 요약

- P0 이슈: N건
- P1 이슈: N건
- 전체 품질: [양호 / 주의 / 개선 필요]

---

### 3. 테스트 실행 결과

| 테스트 유형 | 전체 | 성공 | 실패 | 스킵 |
|------------|------|------|------|------|
| 단위 테스트 | N | N | N | N |
| API 통합 | N | N | N | N |
| 브라우저 E2E | N | N | N | N |

**실패 분석**: [있으면 요약]

---

### 4. 회귀 분석 요약

- 변경 파일: N개
- 영향받는 테스트: N개
- 영향 범위: FULL / PARTIAL / MINIMAL

---

### 5. 탐색적 테스팅 요약 (실행된 경우)

- 탐색 영역: [영역명]
- 발견된 이슈: N건

---

### 종합 건강도

| 지표 | 상태 |
|------|------|
| 커버리지 | ✅ 양호 / ⚠️ 갭 있음 / ❌ 부족 |
| 테스트 품질 | ✅ 양호 / ⚠️ 개선 필요 / ❌ 위험 |
| 테스트 통과율 | ✅ 100% / ⚠️ 일부 실패 / ❌ 다수 실패 |
| 회귀 위험 | ✅ 낮음 / ⚠️ 중간 / ❌ 높음 |

### 권장 액션

1. [우선순위 1 — 즉시 필요한 작업]
2. [우선순위 2 — 이번 주 내 권장]
3. [우선순위 3 — 향후 개선]
```

---

## 5. 자율 파이프라인 원칙

전체 QA 파이프라인은 **완전 자율 모드**로 동작한다:

1. **자동 수정**: 테스트 실패 발견 시 즉시 분석하고 수정한다 (소스 코드 버그 포함)
2. **자동 커밋**: 수정 사항은 즉시 커밋한다
   ```bash
   git add {수정된 파일들}
   git commit -m "fix: {수정 내용} (via qa-full pipeline)"
   ```
3. **자동 푸시**: 커밋 후 자동 푸시하여 CI/CD 트리거
   ```bash
   git push origin HEAD
   ```
4. **연속 실행**: 수정 후 관련 테스트를 재실행하여 수정이 유효한지 검증. 실패가 남아있으면 반복.

---

## 6. 규칙

- Phase 1의 3개 Agent는 반드시 병렬로 실행한다 (순차 실행 금지).
- 테스트 실행은 순차로 한다 (리소스 충돌 방지).
- 서버가 없으면 자동으로 시작한다. Phase 0에서 서버 자동 시작에 실패한 경우에만 Phase 2-3를 스킵하고 안내한다.
- 전체 실행 시간이 길어도 중간에 중단하지 않는다.
- 리포트는 간결하게. 상세 분석은 개별 `/qa-*` 커맨드로 확인하도록 안내한다.
- AI는 이슈 발견 → 수정 → 커밋 → 푸시를 자율적으로 수행한다. 사용자는 최종 리포트만 확인하면 된다.
