# Gate System 마이그레이션 가이드

## Phase 1: 데이터베이스 스키마 확장

이 마이그레이션은 Gate 방식 시험 시스템을 위한 데이터베이스 스키마 확장입니다.

### 변경 사항

#### 1. `exams` 테이블 추가 필드
- `open_at`: 입장 시작 시간 (Access Window 시작)
- `close_at`: 입장 마감 시간 (Join cutoff)
- `started_at`: Gate Start 신호 시간 (교수 Start Exam 클릭 시)
- `allow_draft_in_waiting`: Waiting Room에서 Drafting 허용 여부
- `allow_chat_in_waiting`: Waiting Room에서 AI Chat 허용 여부

#### 2. `sessions` 테이블 추가 필드
- `status`: 세션 상태 (`not_joined`, `joined`, `waiting`, `in_progress`, `submitted`, `auto_submitted`, `locked`)
- `started_at`: Gate Start 신호 수신 시간
- `attempt_timer_started_at`: 개별 타이머 시작 시간
- `auto_submitted`: 자동 제출 플래그
- `preflight_accepted_at`: Preflight Modal 수락 시간

### 마이그레이션 실행 방법

#### 방법 1: SQL 파일 직접 실행 (Supabase Dashboard)

1. Supabase Dashboard에 접속
2. SQL Editor로 이동
3. `prisma/migrations/add_gate_system_fields.sql` 파일 내용을 복사하여 실행

#### 방법 2: Prisma Migrate 사용

```bash
# Prisma Client 재생성 (스키마 변경 반영)
npx prisma generate

# 마이그레이션 적용 (Supabase에서는 직접 SQL 실행 권장)
npx prisma migrate deploy
```

#### 방법 3: Supabase CLI 사용 (선택사항)

```bash
# Supabase CLI로 마이그레이션 적용
supabase db push
```

### 기존 데이터 마이그레이션

마이그레이션 SQL에는 기존 데이터를 자동으로 마이그레이션하는 로직이 포함되어 있습니다:

1. **sessions 테이블**:
   - `submitted_at`이 있는 세션 → `status = 'submitted'`
   - `submitted_at`이 없는 세션 → `status = 'in_progress'`
   - 기존 세션의 `attempt_timer_started_at`을 `created_at`으로 설정

2. **exams 테이블**:
   - 기존 `status` 값은 유지됩니다
   - 필요시 `active` → `scheduled`로 변경 가능 (주석 처리된 부분)

### 롤백 방법

마이그레이션을 되돌려야 하는 경우:

```bash
# Supabase SQL Editor에서 실행
# prisma/migrations/rollback_gate_system_fields.sql 파일 내용 실행
```

**주의**: 롤백 시 데이터 손실이 발생할 수 있으므로, 프로덕션 환경에서는 반드시 백업 후 실행하세요.

### 마이그레이션 후 확인 사항

1. **Prisma Client 재생성**:
   ```bash
   npx prisma generate
   ```

2. **스키마 검증**:
   ```bash
   npx prisma validate
   ```

3. **데이터 확인**:
   - `exams` 테이블에 새 필드가 추가되었는지 확인
   - `sessions` 테이블에 새 필드가 추가되었는지 확인
   - 기존 세션의 `status` 값이 올바르게 설정되었는지 확인

### 다음 단계

Phase 1 완료 후:
- Phase 2: API 로직 구현
- Phase 3: 프론트엔드 UI 구현
- Phase 4: 실시간 통신 설정

### 문제 해결

#### 마이그레이션 실패 시

1. **컬럼이 이미 존재하는 경우**:
   - SQL 파일의 `IF NOT EXISTS` 구문이 자동으로 처리합니다
   - 에러가 발생하면 해당 ALTER TABLE 문을 건너뛰고 계속 진행

2. **인덱스 충돌**:
   - `CREATE INDEX IF NOT EXISTS` 구문이 자동으로 처리합니다

3. **데이터 타입 불일치**:
   - 기존 데이터와 새 스키마가 호환되는지 확인
   - 필요시 데이터 변환 로직 추가

### 참고

- 모든 시간 필드는 `TIMESTAMP WITH TIME ZONE` 타입을 사용합니다
- 기본값은 애플리케이션 레벨에서 설정되며, 데이터베이스에서는 NULL을 허용합니다
- 상태 값은 애플리케이션 레벨에서 검증합니다 (유연성을 위해 CHECK 제약 조건은 주석 처리)
