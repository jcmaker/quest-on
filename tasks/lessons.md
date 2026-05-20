## 2026-03-06

- QA 증상을 제품 정책으로 즉시 해석하지 않는다.
- 먼저 `정책 허용 여부`, `평가 로직`, `UX/렌더링 문제`를 분리해 확인한다.
- 직접 답변 제공처럼 허용된 동작은 차단하지 말고, 평가 근거와 회복 여부를 구조화해서 반영한다.
- 사용자가 `Mermaid만` 원하면 문서형 설명보다 다이어그램 파일과 렌더 산출물을 우선 만든다.
- 구조 리뷰 요청도 사용자가 다이어그램 중심을 명시하면 `섹션별 .mmd + 렌더 검증` 형태로 제공한다.

## 2026-05-18

- 사용자가 단순화를 요청한 폼 UI에서는 내부적으로 자동 생성되거나 완료 후에만 필요한 값(예: 접속 코드)을 작성 중 화면에 노출하지 않는다.
- 참고 UI가 넓은 여백과 독립 질문 블록을 쓰는 경우, fieldset/legend처럼 전체 섹션을 테두리로 감싸는 패턴을 피하고 실제 입력 컨트롤에만 경계를 둔다.

## 2026-05-20

- 루브릭·자동 서술형 채점을 제거할 때 DB 컬럼(`exams.rubric`)은 보존하고 런타임·출제 UI·프롬프트만 끊는다. 기존 데이터 무손실.
- 제출 시 자동 채점은 `multiple-choice`/`true-false`만 큐잉하고, essay/case는 인스트럭터 `case-grade/chat` → `case-grade/commit` 경로로만 `grades`에 기록한다.
- 시험 대시보드 집계는 무거운 analytics overview 대신 `GET /api/exam/[examId]/student-summaries` 한 엔드포인트로 MCQ/OX/서술 진행률을 계산한다.
- 시험 채팅/답안 요약은 **제출 시 QStash phase**에서만 생성한다. `case-grade/commit`에서 `triggerExamSummariesAfterCaseCommit` 같은 재생성을 붙이지 않는다.
- 문항별 요약 placeholder는 `grade_type: "ai_summary"`로 저장해 `overallScore`·`isCaseGraded`에 영향을 주지 않게 한다.
- 강사 채점 UI: 세션 요약은 케이스 문항 사이드에서만, 문항별 카드는 `caseCount >= 2`일 때만.
