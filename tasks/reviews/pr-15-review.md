# PR 15 Local Review

Date: 2026-05-26
Branch: `review/pr-15`
Base: `origin/main`
PR: `feat(exam): 출제 UX 개선 + 채점 카드 서술 상태 표기`

## Decision

Request changes before merge.

The authoring-page UX changes are mostly low risk, but the grading-status part
does not currently land on the actual instructor exam-detail screen. The PR
changes `ExamStudentCard`, while `/instructor/[examId]` renders
`ExamStudentRow`. As a result, the claimed "서술" status-label improvement is
not visible to the target user.

## Main Findings

### P1 - Grading status change is not wired to the real screen

The PR changes:

- `components/instructor/ExamStudentCard.tsx`

The real exam-detail student list renders:

- `app/(app)/instructor/[examId]/page.tsx`
- `components/instructor/ExamStudentRow.tsx`

Evidence:

- `app/(app)/instructor/[examId]/page.tsx` renders `ExamStudentRow`.
- `components/instructor/ExamStudentRow.tsx` still displays
  `formatProgress(student.caseProgress.graded, student.caseProgress.total)`.
- `rg "<ExamStudentCard"` shows no active usage of `ExamStudentCard`.

Impact:

강사가 실제로 보는 `/instructor/{examId}` 화면에서는 PR 설명과 달리
서술 칸이 계속 `0/2`, `1/2` 같은 숫자 진행률로 보입니다. PR의 핵심
제품 효과가 배포되지 않는 상태입니다.

### P2 - New card label loses grading-progress information

`ExamStudentCard.caseStatusLabel()` returns only `제출됨` when:

- `student.status === "submitted"`
- `caseProgress.total > 0`
- `caseProgress.graded === 0`

Impact:

`caseProgress={ graded: 0, total: 2 }`인 경우 강사가 알아야 할
"2문항 미채점" 정보가 사라집니다. `overallStatus`도 보지 않기 때문에
AI 채점 실패나 채점중 상태에서도 서술 칸만 보면 단순 제출처럼 보일 수
있습니다.

Preferred direction:

Use one shared formatter for row/card, preserving both status and progress:

- 미제출/응시중/no-case: `-`
- 제출 미채점: `제출됨 0/2`
- 일부 채점: `제출됨 1/2`
- 전체 채점: `채점 완료 2/2`
- 실패 상태가 필요하면 `overallStatus`를 반영해 `채점 실패 0/2` 등으로
  명확히 표시

### P3 - `AI 수정` label is ambiguous for empty questions

The PR changes the question-card CTA and sheet title to `AI 수정`.
That is accurate for already-written questions, but an empty manually added
question can use the same flow to generate an initial draft.

Impact:

빈 문제에서 버튼은 사실상 "AI 생성" 진입점인데, CTA는 "AI 수정"이고
sheet helper text says AI will make the problem. The button and helper text
are not aligned.

Preferred direction:

Use conditional copy:

- Empty question: `AI 생성`
- Non-empty question: `AI 수정`

Apply the same condition to `QuestionAdjustSheet` title if practical.

## Required To-Dos Before Merge

1. Apply the "서술" display change to `ExamStudentRow`, or replace the
   exam-detail list with the intended card component if that is the real
   product direction.
2. Extract a shared case-progress label formatter so `ExamStudentRow` and
   `ExamStudentCard` cannot drift.
3. Preserve progress counts in the new label policy (`0/N`, `1/N`, `N/N`) so
   instructors can see remaining manual grading work.
4. Add UI coverage for submitted essay sessions in the instructor exam-detail
   flow. At minimum assert submitted-ungraded, partially graded, fully graded,
   and no-case states.
5. Consider conditional `AI 생성` / `AI 수정` copy for empty vs non-empty
   questions.

## Verification Performed

- `git diff --check origin/main...HEAD`: pass
- `npx tsc --noEmit --pretty false`: pass
- Targeted ESLint on changed files: 0 errors, 1 existing warning
  - `components/instructor/SimpleExamAuthoringForm.tsx:293`
  - `successQuestions` is unused and already exists on `origin/main`
- `npm run test`: pass
  - 27 test files
  - 305 tests

Browser e2e was attempted with:

```sh
npx playwright test --config=e2e/playwright.config.ts --project=browser-flows e2e/browser/flows/instructor-exam.spec.ts
```

It could not complete in this local environment because `.env.test` is absent
and the Next middleware fails without:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Failure location observed:

- `proxy.ts:46`

## Notes

Existing untracked files were intentionally not included in this review commit:

- `exports/`
- `scripts/export-sessions.ts`
