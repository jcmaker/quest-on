# Quest-On: 프로젝트 전체 명세서

> **목적**: 이 문서는 Quest-On MVP를 기반으로 새로운 프로덕션 프로젝트를 시작할 때, Claude Code / Codex 등 AI 코딩 도구가 프로젝트의 전체 맥락을 완전히 이해할 수 있도록 작성된 포괄적 명세서입니다.

---

## 1. 제품 개요

### 1.1 무엇인가

Quest-On은 **AI 기반 시험/과제 평가 플랫폼**입니다. 핵심 가치 제안은 "AI 부정행위를 막을 수 없다면, 평가의 일부로 만드세요"입니다.

학생이 시험 중 AI와 대화하는 것 자체를 **평가 데이터**로 활용합니다. AI와 어떻게 대화했는지(질문 방식, 힌트 사용 횟수, 사고 과정)가 최종 답안과 함께 채점됩니다.

### 1.2 핵심 사용자

| 역할 | 설명 |
|------|------|
| **Instructor (교수/강사)** | 시험 출제, 학생 모니터링, 채점 검토 |
| **Student (학생)** | 시험 응시, AI 튜터와 대화, 과제 제출 |
| **Admin (관리자)** | 사용자 관리, AI 비용 추적, 강사 승인 |

### 1.3 핵심 기능 흐름

```
[강사] 시험 생성 → 자료 업로드 → AI 문제/루브릭 생성 → 시험 활성화
  ↓
[학생] 코드로 입장 → 대기실 → 시험 시작 → AI 튜터와 대화하며 답안 작성 → 제출
  ↓
[시스템] QStash 비동기 자동 채점 → AI 채점 결과 저장
  ↓
[강사] 채점 결과 검토 → 수동 조정 → 성적 공개
```

---

## 2. 제품 철학 (핵심 원칙)

새 기능 개발 시 항상 이 기준으로 판단:

1. **명확한 이유 없이 기능 추가 금지** — 사용자 마찰을 줄이는가? 없애면 안 되는가?
2. **MVP = 핵심만** — 가치를 이해하는 데 필요한 것만
3. **기능은 추가보다 삭제가 어렵다** — 항상 "삭제 가능한가?" 질문
4. **데이터 구조가 뼈대다** — 잘못된 스키마는 오래 남는다
5. **시나리오가 기능을 결정한다** — "언제 사용자가 이 기능을 쓰는가?"
6. **저장 = 책임** — 저장 실패, 삭제, 오프라인 상태를 진지하게 다뤄야 한다
7. **보안은 기본값, 추가 기능이 아님** — 서버에서 인증/검증, 최소 데이터 수집

---

## 3. 기술 스택 (MVP 기준)

### 3.1 현재 MVP 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript 5 (strict) |
| 스타일 | Tailwind CSS 4 |
| UI 컴포넌트 | Radix UI + shadcn/ui |
| 상태 관리 | TanStack React Query 5 |
| ORM | Prisma 6 |
| DB | Supabase PostgreSQL (pgvector 포함) |
| Auth | Clerk |
| AI | OpenAI API (gpt-5.3-chat-latest, gpt-5.4, text-embedding-3-small) |
| 캐시/Rate limit | Upstash Redis |
| 비동기 작업 | Upstash QStash |
| 호스팅 | Vercel |
| 파일 저장 | Supabase Storage |

### 3.2 신규 프로덕션 스택 (계획)

MVP 스택에서 백엔드를 FastAPI로 분리하는 방향. 프론트엔드(Next.js)는 유지하되 API 레이어를 Python FastAPI로 교체.

---

## 4. 데이터 모델

### 4.1 전체 테이블 관계도

```
exams (시험/과제)
├─→ exam_nodes (폴더 트리, self-referential)
├─→ sessions (학생 응시 세션)
│   ├─→ submissions (문항별 답안)
│   ├─→ messages (AI 채팅 기록)
│   ├─→ grades (채점 결과)
│   ├─→ ai_events (AI 호출 로그)
│   └─→ session_quiz_attempts (퀴즈 시도)
├─→ questions (문항 레코드, 별도 조회용)
├─→ exam_material_chunks (RAG 벡터 청크)
└─→ ai_events (시험 레벨 AI 로그)

student_profiles (학생 프로필, Clerk ID 연결)
audit_logs (시스템 감사 로그)
```

### 4.2 테이블 상세

#### `exams` — 시험/과제 마스터 테이블

```sql
id              UUID PK
title           TEXT NOT NULL
code            TEXT UNIQUE              -- 학생 입장 코드 (6자 영숫자)
description     TEXT
duration        INTEGER NOT NULL         -- 시험 시간 (초)
questions       JSONB NOT NULL           -- 문항 배열 (아래 형식 참고)
status          TEXT DEFAULT 'draft'     -- draft | published | closed
instructor_id   TEXT NOT NULL            -- Clerk 강사 ID
student_count   INTEGER DEFAULT 0        -- 입장 학생 수 (원자적 증가)
materials       JSONB DEFAULT '[]'       -- 업로드 파일 메타데이터
rubric          JSONB DEFAULT '[]'       -- 채점 루브릭 (아래 형식 참고)
open_at         TIMESTAMPTZ              -- 입장 가능 시작 시간
close_at        TIMESTAMPTZ              -- 입장 마감 시간
started_at      TIMESTAMPTZ              -- 강사가 "시작" 클릭한 시간
allow_draft_in_waiting    BOOLEAN DEFAULT false
allow_chat_in_waiting     BOOLEAN DEFAULT false
chat_weight     INTEGER DEFAULT 50       -- 채팅 단계 비중 (0-100), 답안 비중 = 100 - chat_weight
rubric_public   BOOLEAN DEFAULT false    -- 루브릭 학생 공개 여부
materials_text  JSONB DEFAULT '[]'       -- 파일에서 추출한 텍스트 (RAG용)
rag_status      TEXT DEFAULT 'none'      -- none | pending | processing | completed | failed
type            TEXT DEFAULT 'exam'      -- exam | report | code | erd | mindmap
deadline        TIMESTAMPTZ              -- 과제 제출 마감 (과제형만)
assignment_prompt TEXT                   -- 과제 안내문
initial_state   JSONB DEFAULT '{}'       -- 초기 상태 (코드 템플릿 등)
canvas_config   JSONB DEFAULT '{}'       -- 캔버스 설정 { secondaryCanvas, layout, codeEnabled, erdEnabled }
grades_released BOOLEAN DEFAULT false    -- 성적 공개 여부
language        TEXT DEFAULT 'ko'        -- AI 시스템 프롬프트 언어: ko | en
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

**questions JSONB 형식:**
```json
[
  {
    "id": "q1",
    "text": "문항 텍스트",
    "type": "essay",          // essay | short_answer | multiple_choice
    "points": 30,
    "aiContext": "AI 채점 시 참고할 추가 맥락"
  }
]
```

**rubric JSONB 형식:**
```json
[
  {
    "evaluationArea": "개념 이해",
    "detailedCriteria": "핵심 개념을 정확히 설명했는가"
  }
]
```

---

#### `sessions` — 학생 응시 세션

```sql
id                        UUID PK
exam_id                   UUID FK → exams(id) CASCADE
student_id                TEXT NOT NULL              -- Clerk 학생 ID
status                    TEXT DEFAULT 'not_joined'  -- 상태 흐름 참고
created_at                TIMESTAMPTZ DEFAULT now()  -- 입장 시간
submitted_at              TIMESTAMPTZ                -- 제출 시간 (NULL = 미제출)
started_at                TIMESTAMPTZ                -- 게이트 시작 수신 시간
attempt_timer_started_at  TIMESTAMPTZ                -- 개인 타이머 시작 (지각생용)
auto_submitted            BOOLEAN DEFAULT false
preflight_accepted_at     TIMESTAMPTZ
late_entry_approved_at    TIMESTAMPTZ
late_entry_denied_at      TIMESTAMPTZ
is_active                 BOOLEAN DEFAULT true
last_heartbeat_at         TIMESTAMPTZ
device_fingerprint        TEXT
used_clarifications       INTEGER DEFAULT 0           -- 힌트 요청 횟수
grading_progress          JSONB                       -- { status, total, completed, failed, updated_at }
ai_summary                JSONB                       -- AI 채점 요약
final_answer              TEXT                        -- 과제형 최종 답안
final_answer_updated_at   TIMESTAMPTZ
compressed_session_data   TEXT
compression_metadata      JSONB DEFAULT '{}'

UNIQUE(exam_id, student_id)
```

**세션 상태 흐름:**
```
not_joined → joined → waiting → in_progress → submitted
                                             → auto_submitted (타임아웃)
                                             → locked (비정상 종료)
```

---

#### `submissions` — 문항별 답안

```sql
id                    UUID PK
session_id            UUID FK → sessions(id) CASCADE
q_idx                 INTEGER NOT NULL              -- 문항 인덱스 (0-based)
answer                TEXT NOT NULL
created_at            TIMESTAMPTZ DEFAULT now()
updated_at            TIMESTAMPTZ
answer_history        JSONB DEFAULT '[]'             -- [{ text, timestamp }]
edit_count            INTEGER DEFAULT 0
workspace_state       JSONB DEFAULT '{}'             -- { code, erd, notes }
compressed_answer_data TEXT
compression_metadata  JSONB DEFAULT '{}'

UNIQUE(session_id, q_idx)
```

---

#### `messages` — AI 채팅 기록

```sql
id                    UUID PK
session_id            UUID FK → sessions(id) CASCADE
q_idx                 INTEGER NOT NULL              -- 어느 문항에서의 대화인지
role                  TEXT NOT NULL                 -- user | assistant
content               TEXT NOT NULL
created_at            TIMESTAMPTZ DEFAULT now()
response_id           TEXT                          -- OpenAI Responses API ID (대화 체이닝용)
message_type          TEXT                          -- concept | calculation | strategy | other
tokens_used           INTEGER
metadata              JSONB DEFAULT '{}'
compressed_content    TEXT
compression_metadata  JSONB DEFAULT '{}'
```

---

#### `grades` — 채점 결과

```sql
id              UUID PK
session_id      UUID FK → sessions(id) CASCADE
q_idx           INTEGER NOT NULL
score           INTEGER NOT NULL
comment         TEXT
stage_grading   JSONB                 -- { chat: 25, answer: 75 } 단계별 점수
grade_type      TEXT DEFAULT 'manual' -- auto | manual
ai_summary      JSONB                 -- AI 채점 근거
created_at      TIMESTAMPTZ DEFAULT now()

UNIQUE(session_id, q_idx)
```

---

#### `ai_events` — AI API 호출 로그 (비용 추적)

```sql
id                        UUID PK
provider                  TEXT NOT NULL              -- openai | anthropic
endpoint                  TEXT NOT NULL
feature                   TEXT NOT NULL              -- chat | grade_auto | embed | generate_questions | ...
route                     TEXT NOT NULL              -- 호출한 API 라우트
model                     TEXT NOT NULL
user_id                   TEXT
exam_id                   UUID FK → exams(id) SET NULL
session_id                UUID FK → sessions(id) SET NULL
q_idx                     INTEGER
status                    TEXT NOT NULL              -- success | error | timeout
attempt_count             INTEGER DEFAULT 1
latency_ms                INTEGER
input_tokens              INTEGER
output_tokens             INTEGER
cached_input_tokens       INTEGER
reasoning_tokens          INTEGER
total_tokens              INTEGER
estimated_cost_usd_micros BIGINT DEFAULT 0          -- USD × 1,000,000
pricing_version           TEXT NOT NULL
request_id                TEXT
response_id               TEXT
error_code                TEXT
metadata                  JSONB DEFAULT '{}'
created_at                TIMESTAMPTZ DEFAULT now()
```

---

#### `exam_material_chunks` — RAG 벡터 청크

```sql
id          UUID PK
exam_id     UUID FK → exams(id) CASCADE
file_url    TEXT NOT NULL
content     TEXT                          -- 청크 텍스트
embedding   vector(1536)                  -- pgvector, OpenAI text-embedding-3-small
metadata    JSONB DEFAULT '{}'            -- { page, section, ... }
created_at  TIMESTAMPTZ DEFAULT now()
```

---

#### `exam_nodes` — 폴더 트리 (강사 대시보드)

```sql
id            UUID PK
instructor_id TEXT NOT NULL              -- Clerk 강사 ID
parent_id     UUID FK → exam_nodes(id) CASCADE  -- NULL = 루트
kind          TEXT NOT NULL              -- folder | exam
name          TEXT NOT NULL
sort_order    INTEGER DEFAULT 0
exam_id       UUID FK → exams(id) CASCADE  -- kind='exam'일 때만
color         TEXT
created_at    TIMESTAMPTZ
updated_at    TIMESTAMPTZ
```

---

#### `student_profiles` — 학생 프로필

```sql
id              UUID PK
student_id      TEXT UNIQUE              -- Clerk 사용자 ID
name            TEXT NOT NULL
student_number  TEXT NOT NULL            -- 학번
school          TEXT NOT NULL
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

---

#### `session_quiz_attempts` — 퀴즈 시도

```sql
id                  UUID PK
session_id          UUID FK → sessions(id) CASCADE
exam_id             UUID FK → exams(id) CASCADE
student_id          TEXT NOT NULL
questions           JSONB NOT NULL
answers             JSONB DEFAULT '{}'   -- { q_idx: answer_text }
score               INTEGER              -- 0-100
total_questions     INTEGER DEFAULT 0
time_limit_seconds  INTEGER DEFAULT 15   -- 문항당 제한 시간(초)
started_at          TIMESTAMPTZ
submitted_at        TIMESTAMPTZ
status              TEXT DEFAULT 'pending'  -- pending | in_progress | submitted
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ

UNIQUE(session_id)
```

---

## 5. API 명세

### 5.1 API 라우트 작성 규칙

모든 API는 아래 순서를 반드시 지킨다:

```
1. CORS preflight 처리 (OPTIONS)
2. Rate limiting 확인
3. 인증 (Auth)
4. 입력 검증 (Zod / Pydantic)
5. 소유권 확인 (student_id 또는 instructor_id가 현재 사용자인가)
6. 비즈니스 로직
7. AI 이벤트 추적 (OpenAI 호출이 있었다면 ai_events에 기록)
8. 응답 반환
```

### 5.2 엔드포인트 목록

#### 인증/사용자

| Method | Path | 설명 | Auth |
|--------|------|------|------|
| PATCH | `/api/user/profile` | 온보딩 프로필 저장 (역할, 이름, 학교) | 로그인 사용자 |
| GET | `/api/student/profile` | 학생 프로필 조회 | Student |
| POST | `/api/student/profile` | 학생 프로필 생성/수정 | Student |
| POST | `/api/auth/revoke-other-sessions` | 다른 기기 세션 취소 | 로그인 사용자 |
| POST | `/api/admin/auth` | 관리자 로그인 (HMAC JWT 발급) | Public |

#### 시험 관리

| Method | Path | 설명 | Auth |
|--------|------|------|------|
| POST | `/api/supa` | 내부 Supabase 액션 라우터 (세션 초기화, 자동저장 등) | 로그인 사용자 |
| GET | `/api/session/[sessionId]/preflight` | 프리플라이트 체크 (기기, 프로필 등) | Student |
| GET | `/api/session/[sessionId]/live-messages` | SSE: 실시간 메시지 스트림 | Instructor |
| GET | `/api/session/[sessionId]/grade` | 채점용 세션 상세 조회 | Instructor |
| POST | `/api/session/[sessionId]/grade` | 수동 채점 저장 | Instructor |
| PUT | `/api/session/[sessionId]/grade` | AI 자동 채점 트리거 | Instructor |

#### 학생 활동

| Method | Path | 설명 | Auth |
|--------|------|------|------|
| GET | `/api/student/sessions` | 내 세션 목록 (페이지네이션) | Student |
| POST | `/api/feedback` | 시험 최종 제출 | Student |
| POST | `/api/chat` | AI 채팅 (RAG 포함) | Student |
| POST | `/api/assignment-chat` | 과제 AI 채팅 (SSE 스트리밍) | Student |
| POST | `/api/student/session/[sessionId]/quiz` | 퀴즈 답안 제출 | Student |
| GET | `/api/student/session/[sessionId]/report` | 제출 후 결과 조회 | Student |
| POST | `/api/log/paste` | 붙여넣기 이벤트 로그 (부정행위 감지) | Student |

#### AI 기능

| Method | Path | 설명 | Auth |
|--------|------|------|------|
| POST | `/api/ai/generate-questions` | AI 문항 생성 | Instructor |
| POST | `/api/ai/generate-questions-stream` | AI 문항 생성 (SSE) | Instructor |
| POST | `/api/ai/generate-rubric` | AI 루브릭 생성 (Redis 캐시) | Instructor |
| POST | `/api/ai/adjust-question` | AI 문항 수정 | Instructor |
| POST | `/api/embed` | 텍스트 임베딩 생성 | Instructor |
| POST | `/api/instructor/chat` | 강사용 AI 채팅 | Instructor |

#### 파일/자료

| Method | Path | 설명 | Auth |
|--------|------|------|------|
| POST | `/api/upload` | 시험 자료 업로드 (≤4MB) | Instructor |
| POST | `/api/upload/signed-url` | 대용량 업로드용 서명된 URL | Instructor |
| POST | `/api/extract-text` | 문서에서 텍스트 추출 (RAG용) | Instructor |

#### 관리자

| Method | Path | 설명 | Auth |
|--------|------|------|------|
| GET | `/api/admin/users` | 사용자 목록 | Admin |
| GET | `/api/admin/users/[userId]` | 사용자 상세 | Admin |
| GET | `/api/admin/ai-usage/summary` | AI 사용량 요약 (7d/30d/90d) | Admin |
| GET | `/api/admin/ai-usage/events` | AI 이벤트 로그 | Admin |
| GET | `/api/admin/ai-usage/breakdown` | 기능/모델별 비용 분석 | Admin |
| GET | `/api/admin/instructors/pending` | 승인 대기 강사 목록 | Admin |
| POST | `/api/admin/instructors/approve` | 강사 승인 | Admin |

#### 내부/Cron

| Method | Path | 설명 | Auth |
|--------|------|------|------|
| GET | `/api/cron/grading-sweep` | 채점 stuck 세션 복구 | CRON_SECRET |
| POST | `/api/internal/process-rag` | RAG 비동기 처리 | INTERNAL_API_SECRET |
| POST | `/api/internal/grading-worker` | 채점 워커 | QStash 서명 |
| GET | `/api/health` | 헬스체크 | Public |
| GET | `/api/universities/search` | 대학 검색 | Public |

---

## 6. 핵심 비즈니스 로직

### 6.1 AI 채팅 로직 (`/api/chat`)

학생이 문항 풀면서 AI와 대화하는 핵심 기능.

```
1. 입력: message, sessionId, questionIdx, examId, studentId
2. 세션 소유권 확인
3. RAG 검색:
   - 사용자 메시지 임베딩 (text-embedding-3-small)
   - pgvector 코사인 유사도로 exam_material_chunks 검색
   - 유사도 낮으면 키워드 fallback
   - 상위 k개 청크를 컨텍스트로 추가
4. OpenAI Responses API 호출:
   - 이전 대화의 response_id 체이닝 (비용 절감)
   - 시스템 프롬프트: 역할(AI 튜터), 시험 맥락, RAG 컨텍스트
   - 직접 답안 제공 금지, 힌트만 제공
5. 응답 저장: messages 테이블
6. ai_events 추적
7. 반환: { response, responseId, topSimilarity, warnings }
```

**AI 채팅 시스템 프롬프트 핵심 규칙:**
- 직접 답을 알려주지 않는다
- 소크라테스식 질문으로 사고를 유도한다
- 시험 자료(RAG)에서 찾은 내용을 참고해 힌트 제공
- 시험과 무관한 질문(off-topic)은 정중히 거부
- 언어는 `exams.language` 설정에 따라 한국어/영어 전환

### 6.2 시험 제출 로직 (`/api/feedback`)

```
1. 입력: { examCode, answers[], examId, sessionId, chatHistory, studentId }
2. studentId === 현재 사용자 확인
3. 이미 제출된 세션이면 409 Conflict
4. submissions 테이블에 각 문항 답안 저장 (UPSERT)
5. messages 테이블에 채팅 기록 저장 (압축 후)
6. sessions.submitted_at 업데이트
7. rubric이 있으면 QStash로 자동 채점 트리거
8. 반환: { success, sessionId, status }
```

### 6.3 자동 채점 파이프라인 (QStash 비동기)

```
트리거: 시험 제출 → triggerGradingIfNeeded()
  ↓
QStash Job 1: grade_question (문항별 AI 채점)
  - 루브릭 기준으로 각 문항 채점
  - grades 테이블에 저장 (stage_grading 포함)
  ↓
QStash Job 2: question_summary (문항별 요약)
  - 학생 답안 + AI 채팅 기록 분석
  - 강점/약점 요약 생성
  ↓
QStash Job 3: session_summary (전체 요약)
  - 시험 전체 피드백 생성
  - sessions.ai_summary 업데이트
  - grading_progress.status = 'completed'

Sweeper (15분 주기 cron): stuck 세션 감지 → 재트리거 또는 포기 처리
  - 3회 초과 시 failed로 마킹
  - 세션당 60분 쿨다운
```

**채점 점수 계산:**
```
총점 = (채팅 점수 × chat_weight/100) + (답안 점수 × answer_weight/100)
answer_weight = 100 - chat_weight
```

### 6.4 RAG 파이프라인

```
1. 강사가 파일 업로드 (PDF, DOCX, PPT, HWP 등)
2. /api/extract-text: 파일에서 텍스트 추출 (pdf2json, mammoth)
3. 텍스트를 청크로 분할 (overlap 포함)
4. 각 청크를 text-embedding-3-small로 임베딩
5. exam_material_chunks에 벡터 저장 (pgvector)
6. exams.rag_status = 'completed'

학생 채팅 시:
7. 사용자 메시지 임베딩
8. pgvector 코사인 유사도 검색 → 상위 k개 청크
9. 청크를 AI 컨텍스트에 주입
```

### 6.5 세션 게이트 로직

시험 입장/진행 타임라인 관리:

```
open_at ─────── close_at    (입장 가능 시간 창)
         started_at          (강사가 "시작" 클릭)
              │
              └─ 학생 attempt_timer_started_at (지각생 개인 타이머)

상태 전환:
- 학생이 코드 입력: not_joined → joined
- open_at 이전 또는 started_at 이전: joined → waiting (대기실)
- started_at 이후 입장: joined → in_progress
- 강사가 지각 승인: waiting → in_progress (attempt_timer_started_at 설정)
- 시간 만료: in_progress → auto_submitted
```

### 6.6 세션 하트비트

학생 연결 상태 추적:
- 25-35초마다 `/api/supa` (session_heartbeat 액션) 호출
- `sessions.last_heartbeat_at` 업데이트
- 하트비트 응답으로 시험 종료 신호 수신 가능
- `is_active = false`이면 세션 비활성 상태

### 6.7 자동 저장 (Draft Auto-save)

```
- 30초 ±5초(jitter) 인터벌로 서버에 저장
- Ctrl+S / Cmd+S로 즉시 저장
- 탭 닫기/이동 시 sendBeacon으로 저장
- 서버 저장 실패 시 localStorage 백업
- 오프라인 복구 시 즉시 저장 재시도
```

---

## 7. 페이지 및 라우팅 구조

### 7.1 라우팅 맵

```
/ (랜딩 페이지)
  → 로그인 사용자: 역할에 따라 리디렉션

/(auth)/sign-in     Clerk 로그인
/(auth)/sign-up     Clerk 회원가입

/(app)/onboarding   역할 선택 + 프로필 입력 (신규 사용자)
/(app)/profile      프로필 페이지 (모든 사용자)
/(app)/instructor-pending  강사 승인 대기 페이지

[학생]
/(app)/student                      학생 대시보드 (세션 목록, 통계)
/(app)/join                         코드 입력 (시험/과제)
/(app)/exam/[code]                  시험 응시 페이지
/(app)/exam/[code]/answer           최종 답안 제출
/(app)/assignment/[code]            과제 제출 페이지
/(app)/student/session/[id]/quiz    퀴즈 단계

[강사]
/(app)/instructor                   강사 대시보드 (시험 목록)
/(app)/instructor/new               시험 생성
/(app)/instructor/[examId]          시험 상세 (모니터링, 채점)
/(app)/instructor/[examId]/grade/[studentId]     학생 채점
/(app)/instructor/[examId]/grade/[studentId]/re  재채점
/(app)/instructor/assignment/new    과제 생성
/(app)/instructor/assignment/[id]   과제 상세

[관리자]
/admin              관리자 대시보드
/admin/ai-usage     AI 사용량 분석
/admin/login        관리자 로그인

[법적]
/legal/privacy | /legal/terms | /legal/cookies | /legal/security
```

### 7.2 주요 페이지별 기능 상세

#### 시험 응시 페이지 (`/exam/[code]`)

**레이아웃:** 좌우 분할 (resize 가능)
- 좌측: 문항 패널 (문제 텍스트, 루브릭, 배점)
- 우측: 답안 패널 (Rich Text 에디터, 자동 저장 표시)
- 우측 사이드: AI 채팅 사이드바 (40vw, 접을 수 있음)

**상태 머신:**
```
preflight (시스템 점검 확인) 
→ waiting (대기실, 시작 대기) 
→ in_progress (시험 중) 
→ submitted (완료 화면, 5초 후 대시보드)
```

**주요 기능:**
- 문항 간 이동 (← → 버튼)
- 문항 상태 표시 (답안 작성됨/안됨, 채팅 기록 있음)
- 오프라인 감지 배너
- 모바일: 스크롤 시 헤더 자동 숨김

#### 시험 생성 페이지 (`/instructor/new`)

**섹션 (세로 스크롤):**
1. **시험 정보**: 제목, 코드(자동생성), 시간, 언어
2. **파일 업로드**: Drag-drop, 50MB 한도, 텍스트 자동 추출
3. **AI 문항 생성**: 업로드 자료 기반 문항/루브릭 AI 생성
4. **문항 편집기**: 추가/수정/순서변경 (에세이/단답형/객관식)
5. **루브릭 테이블**: 평가 기준 편집 또는 AI 생성
6. **제출**: "출제하기" 버튼

**초안 자동저장:** localStorage에 30초마다 저장, 페이지 재방문 시 복원

#### 시험 상세/모니터링 (`/instructor/[examId]`)

**주요 섹션:**
- 헤더: 상태 변경 (draft → published → closed), 게이트 시간 설정
- 분석 차트: 점수 분포, 문항별 답안 길이, 시험 소요 시간
- 학생 목록:
  - AI 채점 완료 목록 (일괄 승인 가능)
  - 미채점 목록
  - 검색/정렬 (점수, 문항수, 제출시간)
- 실시간 모니터링: 학생 클릭 → 현재 진행 상황 실시간 보기
- 지각 입장 패널: 승인/거부
- Excel 내보내기 (모든 채점 완료 후)

---

## 8. 컴포넌트 구조

### 8.1 파일 구조 규칙

```
app/(app)/[role]/...       페이지
app/api/[domain]/route.ts  API 라우트
components/[domain]/       도메인별 컴포넌트
components/ui/             Radix/shadcn 기반 공통 UI
hooks/use-[name].ts        React 훅
lib/[name].ts              유틸리티/서비스
```

### 8.2 핵심 훅

| 훅 | 역할 |
|-----|------|
| `useExamSession` | 시험 세션 오케스트레이션 (초기화, 하트비트, Realtime 구독) |
| `useExamSubmission` | 제출 워크플로우 (확인 다이얼로그, 자동제출, 재시도) |
| `useAutoSave` | 답안 자동저장 (30s 인터벌, jitter, beacon, localStorage 백업) |
| `useExamChat` | 문항별 AI 채팅 |
| `useAssignmentChat` | 과제 AI 채팅 (SSE 스트리밍) |
| `useAssignmentSession` | 과제 세션 관리 |
| `useQuestionGeneration` | AI 문항 생성 UI 상태 |
| `useFileUpload` | 파일 선택/업로드 with 진행률 |

### 8.3 핵심 lib 유틸리티

| 파일 | 역할 |
|------|------|
| `lib/ai-tracking.ts` | OpenAI 호출 텔레메트리 래퍼 (토큰, 비용, 지연시간 추적) |
| `lib/ai-cache.ts` | 루브릭/문항 생성 Redis 캐시 (30분 TTL) |
| `lib/ai-pricing.ts` | 모델별 가격 정의, 비용 계산 |
| `lib/grading.ts` | 자동 채점 오케스트레이션 |
| `lib/grading-trigger.ts` | QStash 채점 잡 인큐 |
| `lib/rate-limit.ts` | Redis 기반 rate limiting |
| `lib/compression.ts` | 대형 컨텐츠 LZ 압축/해제 |
| `lib/embedding.ts` | OpenAI 임베딩 생성 |
| `lib/search-chunks.ts` | pgvector 유사도 검색 + 키워드 fallback |
| `lib/prompts.ts` | LLM 프롬프트 빌더 (채팅, 채점, 문항생성, 루브릭) |
| `lib/sanitize.ts` | XSS 방지 (HTML 렌더링 필드만 적용) |
| `lib/api-response.ts` | 표준 응답 헬퍼 |
| `lib/query-keys.ts` | React Query 캐시 키 (문자열 하드코딩 금지) |

---

## 9. 외부 서비스 통합

### 9.1 Clerk (인증)

**역할 저장:** `user.unsafeMetadata.role` 에 `student` / `instructor` / `admin` 저장

**Auth 흐름:**
```
회원가입 → /onboarding (역할 선택) → PATCH /api/user/profile → 역할별 대시보드
강사: status = 'pending' → 관리자 승인 → /instructor 접근
```

**서버에서 사용자 가져오기:**
```typescript
// lib/supabase-auth.ts
const user = await currentUser()  // null이면 401
```

### 9.2 Supabase

**클라이언트 분리:**
- `getSupabaseClient()` — 브라우저, RLS 적용
- `getSupabaseServer()` — 서버사이드, 매 요청마다 새로 생성 (stale 방지)
- `getSupabaseServiceRole()` — 관리자 작업, RLS bypass

**RLS 패턴:**
- 학생은 자신의 세션/제출만 접근
- 강사는 자신의 시험/세션만 접근
- service role은 모든 접근 허용 (백엔드 전용)

**Realtime:**
- 강사 모니터링: 특정 session의 messages 구독
- 학생: exam 종료 신호 수신

### 9.3 OpenAI

**호출 패턴:**
```typescript
// lib/ai-tracking.ts
const result = await callTrackedOpenAI({
  feature: 'chat',
  model: process.env.AI_MODEL,
  examId,
  sessionId,
  fn: () => openai.responses.create({ ... })
})
// 자동으로 ai_events에 로그
```

**모델 설정:**
- 표준: `AI_MODEL` 환경변수 (기본: gpt-5.3-chat-latest)
- 무거운 작업: `AI_MODEL_HEAVY` (기본: gpt-5.4)
- 임베딩: `text-embedding-3-small` (1536차원)

**Responses API 체이닝:**
- `messages.response_id` 에 이전 응답 ID 저장
- 다음 요청 시 `previous_response_id`로 컨텍스트 재활용 (토큰 절감)

### 9.4 Upstash Redis

**사용 용도:**
1. Rate limiting (분산 서버리스 환경에서 공유 카운터)
2. AI 응답 캐싱 (루브릭, 문항 생성, 30분 TTL)

**Rate limit 설정:**
- Chat: 30 req/min
- AI 엔드포인트: 20 req/min
- Upload: 10 req/min
- Admin 로그인: 5 req/min

### 9.5 Upstash QStash

**용도:** 채점 백그라운드 잡 큐. 서버리스 함수가 죽어도 잡이 유실되지 않음.

**잡 체이닝:**
```
세션 제출 → POST /api/internal/grading-worker?phase=grade_question
  → 완료 시 다음 단계를 QStash에 인큐
  → POST /api/internal/grading-worker?phase=question_summary
  → POST /api/internal/grading-worker?phase=session_summary
```

**인증:** QStash 서명 키로 웹훅 검증 (`QSTASH_CURRENT_SIGNING_KEY`)

**개발 환경 fallback:** QStash 미설정 시 인라인으로 동기 채점

---

## 10. 보안 요구사항

### 10.1 인증 예외 없는 규칙

- 모든 서버 API 라우트는 인증 검증 필수
- 예외: `/api/health`, `/api/universities/search`, `/admin/auth`, `/api/cron/*`, `/api/internal/*`
- 내부 엔드포인트는 별도 Bearer 토큰으로 보호 (`INTERNAL_API_SECRET`, `CRON_SECRET`)

### 10.2 소유권 검증 필수

```typescript
// 잘못된 예
const session = await db.sessions.findById(sessionId)

// 올바른 예
const session = await db.sessions.findById(sessionId)
if (session.student_id !== currentUser.id) {
  return unauthorized()
}
```

### 10.3 입력 검증

- 서버에서 Zod (또는 Pydantic)로 모든 입력 검증
- HTML 렌더링 필드만 sanitize (그 외는 sanitize 금지 — 데이터 손실 방지)
- 파일 업로드: 확장자 화이트리스트 + MIME 타입 검증 + 크기 제한

### 10.4 보안 헤더 (Next.js config)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### 10.5 관리자 인증

별도 JWT 기반 (Clerk과 무관):
- `ADMIN_USERNAME` + `ADMIN_PASSWORD` 로 로그인
- HMAC-SHA256으로 JWT 서명 (`ADMIN_SESSION_SECRET`)
- 24시간 유효, httpOnly 쿠키
- 타이밍 공격 방지: `timingSafeEqual()` 사용

---

## 11. 환경변수 목록

### 11.1 Public (NEXT_PUBLIC_ 접두사)

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=  # Clerk 공개키
NEXT_PUBLIC_SUPABASE_URL=           # Supabase 인스턴스 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # Supabase 익명 키 (RLS 적용)
NEXT_PUBLIC_APP_URL=                # 앱 도메인 (QStash 콜백용)
```

### 11.2 Server-only (절대 NEXT_PUBLIC_ 금지)

```bash
CLERK_SECRET_KEY=                   # Clerk 시크릿 키
SUPABASE_SERVICE_ROLE_KEY=          # Supabase 서비스 롤 (RLS bypass)
DATABASE_URL=                       # PostgreSQL 연결 문자열

OPENAI_API_KEY=                     # OpenAI API 키
OPENAI_BASE_URL=                    # 선택: 프록시 URL
AI_MODEL=                           # 기본 모델 (gpt-5.3-chat-latest)
AI_MODEL_HEAVY=                     # 무거운 작업 모델 (gpt-5.4)

UPSTASH_REDIS_REST_URL=             # Upstash Redis 엔드포인트
UPSTASH_REDIS_REST_TOKEN=           # Upstash Redis 토큰
QSTASH_TOKEN=                       # QStash 발행 토큰
QSTASH_CURRENT_SIGNING_KEY=         # QStash 웹훅 서명 키 (현재)
QSTASH_NEXT_SIGNING_KEY=            # QStash 웹훅 서명 키 (로테이션)
QSTASH_WORKER_BASE_URL=             # 선택: QStash 콜백 도메인

ADMIN_SESSION_SECRET=               # 관리자 JWT 서명 키 (32+자 hex)
ADMIN_USERNAME=                     # 관리자 로그인 ID
ADMIN_PASSWORD=                     # 관리자 비밀번호

INTERNAL_API_SECRET=                # 내부 API Bearer 토큰
CRON_SECRET=                        # Cron 엔드포인트 Bearer 토큰
GRADING_SWEEP_DISABLED=             # '1'로 설정 시 sweeper 비활성화

ALLOWED_ORIGINS=                    # 허용 CORS origin (콤마 구분)
TEST_BYPASS_SECRET=                 # 개발 전용: 테스트 인증 bypass (프로덕션 금지)
```

---

## 12. 테스트 전략

### 12.1 타입/린트 검증 (필수, 작업 완료 전 항상 실행)

```bash
npx tsc --noEmit
npm run lint
```

### 12.2 단위 테스트 (Vitest)

위치: `__tests__/`

```bash
npm run test
```

### 12.3 E2E 테스트 (Playwright)

위치: `e2e/`

```bash
npm run test:e2e
npm run test:api
```

---

## 13. 학습된 교훈 (재발 방지)

1. **QA 증상을 즉시 정책 변경으로 이어지 말 것** — 정책 해석, 평가 로직, UX/렌더링 문제를 먼저 분리해서 분석
2. **다이어그램 요청 시 Mermaid 파일 + 렌더링 결과 우선** — 텍스트 설명보다 시각화 우선
3. **직접 답변 허용 여부는 구조적으로 정의** — "AI가 직접 답을 알려줄 수 있는가"는 시스템 프롬프트에 명시
4. **`/api/supa` 액션 라우터 패턴** — 프론트엔드에서 자주 호출하는 소규모 DB 작업은 단일 엔드포인트로 집중 (네트워크 오버헤드 감소)
5. **세션 하나당 압축**: 대형 채팅 기록은 저장/전송 시 반드시 압축 (LZ), 해제 실패 시 graceful fallback

---

## 14. FastAPI 전환 시 고려사항

MVP에서 FastAPI 기반 프로덕션으로 전환할 때 주요 포인트:

### 14.1 분리 범위

| MVP (Next.js API Routes) | 신규 (FastAPI) |
|--------------------------|----------------|
| `/api/chat` | `POST /api/v1/chat` |
| `/api/feedback` | `POST /api/v1/sessions/{id}/submit` |
| `/api/session/*/grade` | `GET/POST/PUT /api/v1/sessions/{id}/grade` |
| `/api/ai/*` | `POST /api/v1/ai/generate-questions` 등 |
| `/api/admin/*` | `GET/POST /api/v1/admin/*` |
| `/api/cron/*` | Celery Beat 또는 APScheduler |
| `/api/internal/*` | FastAPI background tasks + Celery |

### 14.2 Python 등가 라이브러리

| MVP (Node.js) | FastAPI 등가 |
|---------------|-------------|
| Prisma | SQLAlchemy + Alembic |
| Zod | Pydantic v2 |
| Upstash Redis | redis-py + upstash-redis |
| QStash | Celery + Redis Broker 또는 ARQ |
| OpenAI SDK (JS) | openai-python |
| pgvector | pgvector-python |
| multer (upload) | python-multipart + fastapi UploadFile |
| lz-string (압축) | lz4 또는 zstandard |

### 14.3 인증 통합

Clerk은 Python SDK가 있음: `clerk-backend-api`. JWT 검증으로 대체 가능.

FastAPI에서 Clerk 인증 패턴:
```python
from fastapi import Depends, HTTPException
from clerk_backend_api import Clerk

clerk = Clerk(bearer_auth=os.environ["CLERK_SECRET_KEY"])

async def get_current_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401)
    token = authorization.replace("Bearer ", "")
    # Clerk JWT 검증
    ...
```

### 14.4 데이터 모델 재사용

스키마는 그대로 유지 가능. Supabase PostgreSQL + pgvector는 FastAPI에서도 동일하게 사용.

핵심 유지 사항:
- 모든 테이블 구조와 인덱스
- RLS 정책 (Supabase 레벨에서 유지)
- `increment_student_count` RPC 함수
- `create_exam_with_node` 트랜잭션 함수

### 14.5 스트리밍 응답

FastAPI에서 SSE:
```python
from fastapi.responses import StreamingResponse

async def event_stream():
    async for chunk in openai_client.responses.create(..., stream=True):
        yield f"data: {json.dumps({'token': chunk})}\n\n"

@app.post("/api/v1/assignment-chat")
async def assignment_chat():
    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

---

## 15. 주요 설계 결정 및 이유

| 결정 | 이유 |
|------|------|
| 시험 문항을 `exams.questions` JSONB에 저장 | 스키마 마이그레이션 없이 문항 형식 변경 가능 |
| chat_weight (0-100) 채점 비중 | 채팅 과정 자체를 평가 데이터로 활용하는 핵심 철학 |
| QStash로 채점 큐잉 | 서버리스에서 타임아웃(30초) 극복, 신뢰성 보장 |
| OpenAI Responses API + response_id 체이닝 | 대화 컨텍스트 재사용으로 토큰/비용 절감 |
| pgvector for RAG | 외부 벡터 DB 없이 PostgreSQL에서 임베딩 검색 |
| 단일 sessions 테이블에 gate 타임스탬프 저장 | 지각생 개인 타이머, 동기식 시험 관리 |
| LZ 압축 for 채팅 기록 | 학생당 수천 줄 채팅 발생 가능, 저장/전송 비용 절감 |
| 관리자 인증을 Clerk과 분리 | 시스템 접근이 제한적인 상황에서도 관리 가능 |

---

*이 문서는 Quest-On MVP(2025년 5월 기준)의 전체 구현을 기반으로 작성되었습니다.*
