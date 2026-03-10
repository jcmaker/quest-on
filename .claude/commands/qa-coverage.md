# QA Coverage Gap Analysis

API 라우트와 페이지 컴포넌트의 테스트 커버리지를 분석하고, 미테스트 영역을 우선순위화한다.

인자: `$ARGUMENTS` — 특정 영역 (예: `auth`, `ai`, `exam`) 또는 비어있으면 전체 분석

---

## 0. 사전 준비

1. `.claude/qa-context.md` 읽기 — 전체 테스트 인프라 구조 파악
2. `EnterPlanMode` 호출 — 분석 모드 진입 (코드 수정 없음)

---

## 1. API 라우트 커버리지 스캔

### 1-1. 전체 라우트 수집

```
Glob: app/api/**/route.ts
```

각 라우트에서:
- HTTP 메서드 확인 (GET, POST, PUT, DELETE, PATCH)
- 인증 방식 확인 (Clerk, Admin HMAC, 없음)
- 데이터 변경 여부 (mutation vs read-only)

### 1-2. 테스트 매핑

```
Glob: e2e/api/**/*.spec.ts
```

각 API 라우트에 대응하는 테스트 파일 존재 여부 확인:
- `app/api/exam/[examId]/start/route.ts` → `e2e/api/exam/lifecycle.spec.ts` (있음)
- `app/api/embed/route.ts` → (없음)

### 1-3. 테스트 깊이 분석

테스트가 존재하는 경우에도 다음을 확인:
- 모든 HTTP 메서드가 테스트되는가?
- 성공 케이스 + 에러 케이스 모두 있는가?
- 인증/인가 바이패스 테스트가 있는가?

---

## 2. 페이지/컴포넌트 커버리지 스캔

### 2-1. 페이지 수집

```
Glob: app/(app)/**/page.tsx
Glob: app/(public)/**/page.tsx
```

### 2-2. 브라우저 테스트 매핑

```
Glob: e2e/browser/**/*.spec.ts
```

각 페이지에 대응하는 브라우저 테스트 존재 여부 확인.

### 2-3. Page Object 커버리지

`e2e/browser/pages/index.ts`의 Page Object 목록과 실제 테스트에서 사용 여부 확인.

---

## 3. 5대 핵심 플로우 커버리지 체크

각 플로우별 end-to-end 테스트 존재 여부:

| # | 플로우 | 기대 테스트 파일 |
|---|--------|-----------------|
| 1 | 학생 시험 응시 | `student-exam.spec.ts`, `student-join-exam.spec.ts`, `full-exam-submission.spec.ts` |
| 2 | 강사 시험 관리 | `instructor-exam.spec.ts`, `instructor-create-exam.spec.ts`, `instructor-edit-exam.spec.ts` |
| 3 | 채점 플로우 | `grade-to-report.spec.ts`, `grade.spec.ts` |
| 4 | 학생 리포트 | `report.spec.ts`, `student-dashboard.spec.ts` |
| 5 | 관리자 대시보드 | `admin-flow.spec.ts` |

---

## 4. 우선순위화

미테스트 라우트/페이지를 다음 기준으로 정렬:

### 위험도 분류

| 위험도 | 기준 | 예시 |
|--------|------|------|
| **높음** | 인증 + 데이터 변경 | grade, submit, exam start/end |
| **중간** | 인증 + 읽기 전용 | sessions list, report |
| **낮음** | 공개 또는 보조 기능 | health, universities/search |

### 노력 추정

| 크기 | 설명 | 예상 |
|------|------|------|
| **S** | 단순 CRUD, 기존 패턴 재사용 | ~30줄 |
| **M** | 복합 로직, seed 데이터 필요 | ~80줄 |
| **L** | 브라우저 플로우, 새 Page Object 필요 | ~150줄+ |

---

## 5. 출력 형식

```
## QA Coverage Report

**분석 시각**: [현재 시각]
**분석 범위**: [전체 / 특정 영역]

---

### 커버리지 요약

| 영역 | 전체 | 테스트됨 | 미테스트 | 커버리지 |
|------|------|---------|---------|---------|
| API 라우트 | N | N | N | N% |
| 페이지 | N | N | N | N% |
| 핵심 플로우 | 5 | N | N | N/5 |

---

### 미테스트 라우트 (우선순위순)

#### 높은 위험도
1. `app/api/...` — [설명] — 크기: S/M/L
   - 테스트 대상: [어떤 케이스를 테스트해야 하는지]

#### 중간 위험도
...

#### 낮은 위험도
...

---

### 핵심 플로우 커버리지 상세

| 플로우 | 상태 | 누락된 시나리오 |
|--------|------|----------------|
| 학생 시험 응시 | ✅/⚠️/❌ | [구체적 누락 사항] |
| ... | | |

---

### 테스트 템플릿

다음 테스트가 즉시 필요합니다:

[우선순위 1위 라우트에 대한 테스트 스켈레톤 코드]
```

---

## 6. 규칙

- 실제 파일을 읽고 확인한 결과만 보고한다. 추측하지 않는다.
- `$ARGUMENTS`가 있으면 해당 영역만 집중 분석한다.
- 기존 테스트가 충분한 경우 "커버리지 양호"라고 보고한다. 억지로 갭을 찾지 않는다.
- 분석 완료 후 사용자에게 `/qa-generate`로 테스트 생성 여부를 물어본다.
