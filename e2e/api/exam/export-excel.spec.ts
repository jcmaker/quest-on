import { test, expect } from "../../fixtures/auth.fixture";
import ExcelJS from "exceljs";
import {
  cleanupTestData,
  seedExam,
  seedGrade,
  seedSession,
  seedStudentProfile,
  seedSubmission,
} from "../../helpers/seed";

test.describe("GET /api/exam/[examId]/export/excel", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("instructor cannot export scores before exam is closed", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "running" });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/export/excel`
    );

    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("EXAM_NOT_CLOSED");
  });

  test("exports objective scores from raw submissions instead of stale grade rows", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "closed",
      questions: [
        {
          id: "q0",
          idx: 0,
          type: "multiple-choice",
          text: "MCQ",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 2,
        },
        {
          id: "q1",
          idx: 1,
          type: "essay",
          text: "Essay",
        },
      ],
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedStudentProfile("test-student-id");
    await seedSubmission(session.id, 0, { answer: "2" });
    await seedGrade(session.id, 0, 0, "Stale objective grade", "auto");
    await seedGrade(session.id, 1, 80, "Manual essay grade", "manual");

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/export/excel`
    );

    expect(res.status()).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await res.body()) as unknown as Parameters<typeof workbook.xlsx.load>[0]
    );
    const worksheet = workbook.worksheets[0];
    const studentRow = worksheet
      .getRows(1, worksheet.rowCount)
      ?.find((row) => row.getCell(1).value === "Test Student");

    expect(studentRow).toBeTruthy();
    expect(studentRow?.getCell(3).value).toBe(100);
    expect(studentRow?.getCell(4).value).toBe(80);
    expect(studentRow?.getCell(5).value).toBe(90);
  });
});
