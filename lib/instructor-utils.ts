import type { InstructorExam } from "@/lib/types/exam";

interface InstructorQuestion {
  id: string;
  text: string;
  type: string;
}

export function buildInstructorExamContext(
  exam: InstructorExam,
  questions: InstructorQuestion[] = []
): string {
  const total = exam.students?.length ?? 0;
  const completed = exam.students?.filter(
    (s) => s.status === "completed"
  ).length;
  const inProgress = exam.students?.filter(
    (s) => s.status === "in-progress"
  ).length;
  const notStarted = exam.students?.filter(
    (s) => s.status === "not-started"
  ).length;
  const graded = exam.students?.filter((s) => s.isGraded).length ?? 0;
  const hasScores = exam.students?.filter(
    (s) => typeof s.score === "number"
  ).length;

  const questionsPreview = questions
    .slice(0, 12)
    .map((q, i) => `${i + 1}. (${q.type}) ${q.text}`)
    .join("\n");

  return [
    `시험 제목: ${exam.title}`,
    `시험 코드: ${exam.code}`,
    `시험 상태: ${exam.status}`,
    `시험 시간: ${exam.duration}분`,
    exam.description ? `시험 설명: ${exam.description}` : "",
    `문항 수: ${questions.length}`,
    questionsPreview ? `문항(일부):\n${questionsPreview}` : "",
    `학생 수: ${total} (완료 ${completed}, 진행중 ${inProgress}, 미시작 ${notStarted})`,
    `최종채점 완료: ${graded}`,
    `가채점 점수 보유: ${hasScores}`,
  ]
    .filter(Boolean)
    .join("\n");
}
