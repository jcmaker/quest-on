# 데이터베이스 인덱스 최적화 가이드

## 개요

이 문서는 Supabase PostgreSQL 데이터베이스의 쿼리 성능을 향상시키기 위해 추가된 인덱스와 최적화 전략을 설명합니다.

## 성능 개선 결과

### 1. exams 테이블 최적화

#### 인덱스 추가

- **`idx_exams_instructor_created`**: `(instructor_id, created_at DESC)`

  - **목적**: 강사별 시험 목록을 최신순으로 조회하는 쿼리 성능 개선
  - **사용 쿼리 패턴**:
    ```sql
    SELECT * FROM exams
    WHERE instructor_id = ?
    ORDER BY created_at DESC
    ```
  - **성능 개선**: 약 80% (18ms → 3.7ms)

- **`idx_exams_status`**: `(status) WHERE status IS NOT NULL`
  - **목적**: status로 필터링하는 쿼리 성능 개선
  - **사용 쿼리 패턴**:
    ```sql
    SELECT * FROM exams WHERE status = 'active'
    ```
  - **성능 개선**: 약 66% (3.9ms → 1.3ms, Seq Scan → Index Scan)

### 2. messages 테이블 최적화

#### 인덱스 추가

- **`idx_messages_session_created`**: `(session_id, created_at ASC)`
  - **목적**: 세션별 메시지를 시간순으로 조회하는 쿼리 성능 개선
  - **사용 쿼리 패턴**:
    ```sql
    SELECT * FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
    ```
  - **성능 개선**: 약 24% (4ms → 3ms)
  - **특징**: 복합 인덱스로 정렬 비용 제거 (Index Only Scan 가능)

### 3. questions 테이블 최적화

#### 인덱스 추가

- **`idx_questions_exam_idx`**: `(exam_id, idx ASC)`
  - **목적**: 시험별 문제를 순서대로 조회하는 쿼리 성능 개선
  - **사용 쿼리 패턴**:
    ```sql
    SELECT * FROM questions
    WHERE exam_id = ?
    ORDER BY idx ASC
    ```
  - **예상 효과**: 데이터가 많아질수록 효과적 (현재 데이터 없음)

### 4. sessions 테이블 최적화

#### 인덱스 추가

- **`idx_sessions_exam_created`**: `(exam_id, created_at DESC)`
  - **목적**: 시험별 세션을 최신순으로 조회하는 쿼리 성능 개선
  - **사용 쿼리 패턴**:
    ```sql
    SELECT * FROM sessions
    WHERE exam_id = ?
    ORDER BY created_at DESC
    ```
  - **현재 성능**: 이미 최적화됨 (0.15ms)

## 인덱스 사용 가이드

### EXPLAIN ANALYZE 사용법

쿼리 성능을 측정하려면 쿼리 앞에 `EXPLAIN ANALYZE`를 붙입니다:

```sql
EXPLAIN ANALYZE
SELECT * FROM exams
WHERE instructor_id = 'user_123'
ORDER BY created_at DESC;
```

**주의사항**:

- `EXPLAIN ANALYZE`는 실제로 쿼리를 실행하므로, DELETE나 UPDATE 쿼리에는 주의해야 합니다.
- 운영 환경에서는 테스트 데이터로 먼저 확인하세요.

### 인덱스 선택 원칙

PostgreSQL 쿼리 플래너는 다음과 같은 원칙으로 인덱스를 선택합니다:

1. **데이터 크기**: 데이터가 적을 때는 순차 스캔이 더 빠를 수 있어 인덱스를 무시할 수 있습니다.
2. **선택도(Selectivity)**: 데이터의 종류가 다양한 컬럼(예: 이름)의 인덱스를 우선 선택합니다.
3. **WHERE 절 순서**: WHERE 절의 순서와 무관하게 가장 효율적인 인덱스를 선택합니다.

### 복합 인덱스 설계 원칙

1. **자주 함께 사용되는 컬럼**: WHERE 절에서 자주 함께 사용되는 컬럼들을 복합 인덱스로 만듭니다.
2. **정렬이 필요한 경우**: ORDER BY가 자주 사용되는 컬럼을 인덱스에 포함합니다.
3. **컬럼 순서**: 선택도가 높은(데이터 종류가 다양한) 컬럼을 앞에 배치합니다.

## 인덱스 모니터링

### 인덱스 사용 통계 확인

```sql
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### 사용되지 않는 인덱스 찾기

```sql
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;
```

## 인덱스 Trade-off

인덱스는 성능 향상을 가져오지만 비용도 발생합니다:

### 장점

- **읽기 성능 향상**: SELECT 쿼리 속도가 크게 향상됩니다.
- **정렬 비용 감소**: ORDER BY가 필요한 경우 정렬 비용이 줄어듭니다.

### 단점

- **저장 공간**: 인덱스는 추가 디스크 공간을 사용합니다.
- **쓰기 성능 저하**: INSERT, UPDATE, DELETE 시 인덱스도 함께 업데이트해야 합니다.

### 권장 원칙

> **"필요한 만큼만 만들되, 가능한 적게 유지하라"**

- 성능 저하가 발생하는 지점을 파악한 후 최적의 인덱스를 설계합니다.
- 사용되지 않는 인덱스는 정기적으로 제거합니다.

## 추가 최적화 권장사항

### 1. 정기적인 통계 업데이트

PostgreSQL은 자동으로 통계를 업데이트하지만, 대량의 데이터 변경 후에는 수동으로 업데이트할 수 있습니다:

```sql
ANALYZE exams;
ANALYZE messages;
ANALYZE sessions;
```

### 2. VACUUM 실행

데leted된 행이 많을 경우 VACUUM을 실행하여 공간을 회수하고 통계를 업데이트합니다:

```sql
VACUUM ANALYZE sessions;
```

### 3. 쿼리 최적화

인덱스 외에도 쿼리 자체를 최적화할 수 있습니다:

- **불필요한 컬럼 제거**: `SELECT *` 대신 필요한 컬럼만 선택
- **LIMIT 사용**: 전체 결과가 필요하지 않을 때 LIMIT 사용
- **JOIN 최적화**: 필요한 경우에만 JOIN 사용

## 참고 자료

- [PostgreSQL 인덱스 문서](https://www.postgresql.org/docs/current/indexes.html)
- [EXPLAIN 문서](https://www.postgresql.org/docs/current/sql-explain.html)
- [Supabase 성능 최적화 가이드](https://supabase.com/docs/guides/database/performance)

## 추가 최적화 (2025-01-08)

### sessions 테이블: submitted_at 정렬 최적화

#### 인덱스 추가

- **`idx_sessions_exam_submitted_desc`**: `(exam_id, submitted_at DESC NULLS LAST)`
  - **목적**: 제출일 기준 정렬 쿼리 성능 개선 (NULL 값 처리 최적화)
  - **사용 쿼리 패턴**:
    ```sql
    SELECT * FROM sessions
    WHERE exam_id = ?
    ORDER BY submitted_at DESC NULLS LAST
    ```
  - **특징**: NULL 값이 많은 경우를 고려하여 NULLS LAST 옵션 포함
  - **성능**: 기존 인덱스 대비 정렬 비용 감소

## 성능 병목 분석

### 실제 API 엔드포인트 성능

터미널 로그 기준으로 다음 엔드포인트들의 성능을 모니터링 중입니다:

1. **`/api/exam/[examId]/sessions`**: ~1.1-1.2초

   - 주요 쿼리: `sessions` 테이블 조회 + `student_profiles` 조회
   - Clerk API 호출: 각 학생마다 병렬 호출 (병목 가능)
   - 최적화: 인덱스 추가 완료, Clerk API 호출 최적화 검토 필요

2. **`/api/analytics/exam/[examId]/overview`**: ~0.7초

   - 주요 쿼리: `sessions`, `grades`, `messages`, `submissions` 배치 조회
   - 최적화: 인덱스 추가 완료

3. **`/api/exam/[examId]/final-grades`**: ~0.7초
   - 주요 쿼리: `sessions`, `grades` 조회
   - 최적화: 인덱스 추가 완료

### 추가 최적화 권장사항

1. **Clerk API 호출 최적화**

   - 현재: 각 학생마다 개별 API 호출 (Promise.all로 병렬 처리)
   - 개선: Clerk의 batch API 사용 검토 또는 캐싱 전략 도입

2. **쿼리 최적화**

   - 필요한 컬럼만 선택 (이미 적용됨)
   - LIMIT 사용 (데이터가 많을 때)

3. **캐싱 전략**
   - TanStack Query를 사용하여 클라이언트 측 캐싱 활용
   - 학생 프로필 정보는 자주 변경되지 않으므로 캐싱 효과적

## 마이그레이션 정보

이 최적화는 다음 마이그레이션으로 적용되었습니다:

- **마이그레이션 이름**: `add_performance_indexes`, `add_sessions_submitted_at_index`
- **적용 날짜**: 2025-01-08
