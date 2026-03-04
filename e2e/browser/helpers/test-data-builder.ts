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
  seedStudentProfile,
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

  await seedStudentProfile("test-student-id");

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
    await seedStudentProfile(studentId, {
      name: `Test Student ${s}`,
      student_number: `2024-${String(s).padStart(4, "0")}`,
    });
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

// --------------- extended scenario builders ---------------

/**
 * Seed a completed exam scenario (submitted + graded).
 * Useful for report page tests.
 */
export async function seedCompletedExamScenario() {
  const now = new Date().toISOString();

  const questions = [
    {
      idx: 0,
      type: "open_ended" as const,
      text: "Explain polymorphism.",
      prompt: "Explain polymorphism.",
      ai_context: "OOP concept",
    },
    {
      idx: 1,
      type: "open_ended" as const,
      text: "Describe stack vs queue.",
      prompt: "Describe stack vs queue.",
      ai_context: "Data structures",
    },
  ];

  const rubric = [
    { q_idx: 0, criteria: "Understanding of polymorphism", max_score: 100 },
    { q_idx: 1, criteria: "Understanding of data structures", max_score: 100 },
  ];

  const exam = await seedExam({
    status: "running",
    started_at: now,
    questions,
    rubric,
  });

  await seedStudentProfile("test-student-id");

  const session = await seedSession(exam.id, "test-student-id", {
    status: "submitted",
    started_at: now,
    submitted_at: now,
    preflight_accepted_at: now,
    attempt_timer_started_at: now,
  });

  const submissions = [];
  for (let i = 0; i < questions.length; i++) {
    const sub = await seedSubmission(session.id, i, {
      answer: `Detailed answer for question ${i + 1}`,
    });
    submissions.push(sub);
  }

  const grades = [];
  for (let i = 0; i < questions.length; i++) {
    const grade = await seedGrade(session.id, i, 85 + i * 5, "Well done");
    grades.push(grade);
  }

  return { exam, session, submissions, grades };
}

interface MultiStudentOptions {
  studentCount?: number;
}

/**
 * Seed an exam with multiple students in various states.
 * Student 0 = "test-student-id" (submitted), others = "test-student-N" (various states).
 */
export async function seedMultiStudentExamScenario(
  opts: MultiStudentOptions = {},
) {
  const { studentCount = 3 } = opts;
  const now = new Date().toISOString();

  const exam = await seedExam({
    status: "running",
    started_at: now,
  });

  const statuses = ["submitted", "in_progress", "waiting"] as const;
  const students: Array<{
    studentId: string;
    session: Awaited<ReturnType<typeof seedSession>>;
  }> = [];

  for (let i = 0; i < studentCount; i++) {
    const studentId = i === 0 ? "test-student-id" : `test-student-${i}`;
    await seedStudentProfile(studentId, {
      name: `Test Student ${i}`,
      student_number: `2024-${String(i).padStart(4, "0")}`,
    });
    const status = statuses[i % statuses.length];
    const session = await seedSession(exam.id, studentId, {
      status,
      started_at: status !== "waiting" ? now : null,
      submitted_at: status === "submitted" ? now : null,
      attempt_timer_started_at: status === "in_progress" ? now : null,
    });
    students.push({ studentId, session });
  }

  return { exam, students };
}

// Re-export cleanup for convenience
export { cleanupTestData } from "../../helpers/seed";
