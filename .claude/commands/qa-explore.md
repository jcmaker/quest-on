# QA Exploratory Testing Agent

Playwright MCP를 사용하여 실제 브라우저를 조작하며 탐색적 테스팅을 수행한다.

인자: `$ARGUMENTS`
- `student-exam`: 학생 시험 응시 플로우
- `instructor-grading`: 강사 채점 플로우
- `admin-dashboard`: 관리자 대시보드
- (자유 텍스트): 지정된 영역 자유 탐색

---

## 0. 전제조건 확인 & 자동 시작

탐색적 테스팅 전 반드시 확인:

```bash
# 1. dev 서버 실행 확인
curl -sf http://localhost:3000/api/health > /dev/null 2>&1

# 2. mock 서버 실행 확인
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
   for i in $(seq 1 40); do curl -sf http://localhost:3000/api/health > /dev/null 2>&1 && echo "DEV_SERVER: UP" && break; sleep 1; done
   for i in $(seq 1 15); do curl -sf http://localhost:4010/health > /dev/null 2>&1 && echo "MOCK_SERVER: UP" && break; sleep 1; done
   ```
4. 서버 자동 시작을 사용자에게 알린다.

---

## 1. 사전 준비

1. `.claude/qa-context.md` 읽기 — 인증 패턴, UI 텍스트, 핵심 플로우 파악
2. 관련 Page Object 읽기 — UI 구조, selector, 액션 이해
3. 관련 소스 코드 읽기 — 예상 동작 파악

---

## 2. 인증 설정

Playwright MCP 브라우저에서 테스트 바이패스 쿠키를 설정해야 한다.

### 학생 인증

```
browser_navigate: http://localhost:3000
```

네비게이션 후, 브라우저 콘솔을 통해 쿠키 설정:

```javascript
// MCP browser_console 또는 페이지 조작으로 쿠키 설정
document.cookie = "__test_bypass=e2e-test-bypass-token-2024; path=/";
document.cookie = "__test_user=" + encodeURIComponent(JSON.stringify({
  id: "test-student-id",
  firstName: "Test",
  lastName: "Student",
  email: "test-student@test.local",
  unsafeMetadata: { role: "student" }
})) + "; path=/";
document.cookie = "__test_user_role=student; path=/";
```

### 강사 인증

같은 패턴, `role: "instructor"`, `id: "test-instructor-id"` 사용.

### 관리자 인증

Admin은 HMAC 토큰 기반이므로 별도 처리 필요. Admin 로그인 페이지에서 직접 로그인하거나, DB에 세션을 시드해야 한다.

---

## 3. 탐색 시나리오

### 3-1. `student-exam` — 학생 시험 응시

**사전 seed**: `seedStudentExamScenario` 패턴으로 시험 데이터 생성 필요.

1. 시험 입장 페이지 접근 (`/exam/{code}`)
2. 사전 안내 화면 확인
3. 각 문제 탐색 (이전/다음 버튼)
4. AI 채팅 시도 (빈 메시지, 긴 메시지, 특수문자)
5. 답안 작성 (리치 텍스트 에디터)
6. 제출 플로우 확인

**탐색 포인트**:
- 빈 답안으로 제출 시도
- 네트워크 오류 상황 (dev tools throttling)
- 브라우저 뒤로가기/앞으로가기
- 동시 탭 열기
- 긴 텍스트 입력 (10000자+)

### 3-2. `instructor-grading` — 강사 채점

**사전 seed**: `seedInstructorGradingScenario` 패턴으로 채점 데이터 생성 필요.

1. 강사 대시보드 → 시험 선택
2. 채점 화면 진입
3. AI 자동 채점 실행
4. 수동 점수 조정
5. 최종 성적 확인

**탐색 포인트**:
- 0점/100점 입력
- 음수 점수 입력 시도
- 매우 긴 코멘트
- 빠른 연속 클릭 (중복 채점 방지)

### 3-3. `admin-dashboard` — 관리자

1. Admin 로그인 페이지
2. 잘못된 자격증명 시도
3. 사용자 목록 조회
4. 로그 조회
5. AI 사용량 확인

**탐색 포인트**:
- SQL injection 시도 (검색 필드)
- XSS 시도 (`<script>` 태그 입력)
- 권한 에스컬레이션 시도

---

## 4. 각 단계 프로세스

매 단계마다:

1. **액션**: Playwright MCP로 브라우저 조작
   - `browser_navigate(url)` — 페이지 이동
   - `browser_click(selector)` — 요소 클릭
   - `browser_fill(selector, value)` — 입력
   - `browser_snapshot()` — DOM 스냅샷

2. **검증**: 각 액션 후 확인
   - 페이지가 기대한 상태인가?
   - 콘솔 에러가 있는가?
   - 레이아웃이 깨지지 않았는가?
   - 로딩 스피너가 무한히 돌지 않는가?

3. **기록**: 각 단계의 결과 기록
   - 정상 동작 / 이상 발견 / 버그 의심

---

## 5. 이상 입력 테스트

각 입력 필드에 다음을 시도:

| 입력 유형 | 값 |
|----------|-----|
| 빈값 | `""` |
| 공백만 | `"   "` |
| 특수문자 | `<script>alert('xss')</script>` |
| SQL injection | `'; DROP TABLE exams; --` |
| 초장문 | `"a".repeat(10000)` |
| 유니코드 | `"🎓📝✅❌"` |
| HTML 태그 | `<b>bold</b><img src=x onerror=alert(1)>` |
| null 문자 | `"\x00"` |

---

## 6. 출력 형식

```
## QA Exploratory Testing Report

**탐색 영역**: [student-exam / instructor-grading / admin-dashboard / 자유]
**탐색 시각**: [현재 시각]
**dev 서버**: http://localhost:3000
**mock 서버**: http://localhost:4010

---

### 탐색 플로우

#### 단계 1: [페이지/액션 설명]
- **URL**: http://localhost:3000/...
- **액션**: [수행한 동작]
- **결과**: ✅ 정상 / ⚠️ 주의 / ❌ 버그
- **스크린샷**: [있으면 포함]

---

### 발견된 이슈

#### [심각도] 이슈 제목
- **재현 경로**: 단계 1 → 단계 2 → ...
- **예상 동작**: ...
- **실제 동작**: ...
- **스크린샷**: [있으면]

---

### 테스트 추가 제안

다음 시나리오에 대한 자동화 테스트가 필요합니다:
1. [시나리오 설명] → `/qa-generate` 로 생성 가능
2. ...

---

### 요약
- 탐색 단계: N개
- 발견된 이슈: N개 (심각: N / 주의: N)
- 테스트 추가 제안: N개
```

---

## 7. 버그 발견 시 자동 수정

탐색 중 버그를 발견하면:

1. 버그를 리포트에 기록
2. 관련 소스 코드를 읽고 근본 원인 파악
3. **직접 수정** 후 테스트 재실행으로 검증
4. 수정 사항 자동 커밋:
   ```bash
   git add {수정된 파일들}
   git commit -m "fix: {버그 설명} (discovered via qa-explore)"
   git push origin HEAD
   ```
5. 탐색 계속 진행

---

## 8. 규칙

- dev 서버와 mock 서버가 실행 중이어야 한다. 없으면 자동으로 시작한다.
- 프로덕션 데이터에 절대 접근하지 않는다. localhost만 사용.
- 버그 발견 시 자율적으로 수정하고 커밋한다. 사용자 확인을 기다리지 않는다.
- 각 단계에서 `browser_snapshot()`으로 상태를 확인하며 진행한다.
- 시드 데이터가 필요한 경우 API 호출로 직접 생성한다.
