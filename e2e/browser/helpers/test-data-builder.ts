/**
 * Scenario builders for browser E2E tests.
 * Wraps e2e/helpers/seed.ts with common scenarios.
 */
import {
  seedExam,
  seedSession,
  seedSubmission,
  seedMessage,
  seedGrade,
  cleanupTestData,
} from "../../helpers/seed";

// --------------- scenario builders ---------------

interface StudentExamScenarioOptions {
  examStatus?: "draft" | "running" | "closed";
  sessionStatus?: "not_joined" | "joined" | "waiting" | "in_progress" | "submitted";
  withSubmissions?: boolean;
  withGrades?: boolean;
  withMessages?: boolean;
}

/**
 * Seed a complete student exam-taking scenario.
 * Returns all created entities for assertion in tests.
 */
export async function seedStudentExamScenario(
  opts: StudentExamScenarioOptions = {},
) {
  const {
    examStatus = "running",
    sessionStatus = "in_progress",
    withSubmissions = false,
    withGrades = false,
    withMessages = false,
  } = opts;

  const now = new Date().toISOString();

  const exam = await seedExam({
    status: examStatus,
    started_at: examStatus === "running" ? now : null,
  });

  const session = await seedSession(exam.id, "test-student-id", {
    status: sessionStatus,
    started_at:
      sessionStatus !== "not_joined" && sessionStatus !== "joined"
        ? now
        : null,
    preflight_accepted_at:
      sessionStatus !== "not_joined" && sessionStatus !== "joined"
        ? now
        : null,
    attempt_timer_started_at:
      sessionStatus === "in_progress" || sessionStatus === "submitted"
        ? now
        : null,
    submitted_at: sessionStatus === "submitted" ? now : null,
  });

  const submissions: Awaited<ReturnType<typeof seedSubmission>>[] = [];
  if (withSubmissions) {
    for (let i = 0; i < (exam.questions as unknown[]).length; i++) {
      const sub = await seedSubmission(session.id, i, {
        answer: `<p>Answer for question ${i}: This is a detailed response about the topic.</p>`,
      });
      submissions.push(sub);
    }
  }

  const grades: Awaited<ReturnType<typeof seedGrade>>[] = [];
  if (withGrades && withSubmissions) {
    for (let i = 0; i < (exam.questions as unknown[]).length; i++) {
      const grade = await seedGrade(session.id, i, 85, "Good answer");
      grades.push(grade);
    }
  }

  const messages: Awaited<ReturnType<typeof seedMessage>>[] = [];
  if (withMessages) {
    for (let i = 0; i < (exam.questions as unknown[]).length; i++) {
      const userMsg = await seedMessage(session.id, i, {
        role: "user",
        content: "Can you explain this concept?",
      });
      const aiMsg = await seedMessage(session.id, i, {
        role: "assistant",
        content: "Sure! Here is an explanation of the concept...",
      });
      messages.push(userMsg, aiMsg);
    }
  }

  return { exam, session, submissions, grades, messages };
}

interface InstructorGradingScenarioOptions {
  questionCount?: number;
  studentCount?: number;
}

/**
 * Seed a scenario ready for instructor grading.
 */
export async function seedInstructorGradingScenario(
  opts: InstructorGradingScenarioOptions = {},
) {
  const { questionCount = 2, studentCount = 1 } = opts;

  const now = new Date().toISOString();

  const questions = Array.from({ length: questionCount }, (_, i) => ({
    idx: i,
    type: "open_ended" as const,
    text: `Question ${i + 1}: Explain the concept.`,
    prompt: `Question ${i + 1}: Explain the concept.`,
    ai_context: `Context for question ${i + 1}`,
  }));

  const rubric = Array.from({ length: questionCount }, (_, i) => ({
    q_idx: i,
    criteria: `Criteria for question ${i + 1}`,
    max_score: 100,
  }));

  const exam = await seedExam({
    status: "running",
    started_at: now,
    questions,
    rubric,
  });

  const students: Array<{
    session: Awaited<ReturnType<typeof seedSession>>;
    submissions: Awaited<ReturnType<typeof seedSubmission>>[];
  }> = [];

  for (let s = 0; s < studentCount; s++) {
    const studentId = s === 0 ? "test-student-id" : `test-student-${s}`;
    const session = await seedSession(exam.id, studentId, {
      status: "submitted",
      started_at: now,
      submitted_at: now,
      preflight_accepted_at: now,
      attempt_timer_started_at: now,
    });

    const submissions: Awaited<ReturnType<typeof seedSubmission>>[] = [];
    for (let q = 0; q < questionCount; q++) {
      const sub = await seedSubmission(session.id, q, {
        answer: `Student ${s} answer to question ${q + 1}`,
      });
      submissions.push(sub);
    }

    students.push({ session, submissions });
  }

  return { exam, students };
}

// Re-export cleanup for convenience
export { cleanupTestData } from "../../helpers/seed";
