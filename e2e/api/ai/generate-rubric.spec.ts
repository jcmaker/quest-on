import { test, expect } from "../../fixtures/auth.fixture";
import { cleanupTestData } from "../../helpers/seed";

test.describe("AI — POST /api/ai/generate-rubric", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("instructor generates rubric → 200, returns rubric array", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/ai/generate-rubric", {
      data: {
        examTitle: "Data Structures Exam",
        questions: [
          { text: "Explain the difference between a stack and a queue." },
          { text: "Describe the time complexity of binary search." },
        ],
        topics: "data structures, algorithms",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.rubric).toBeTruthy();
    expect(Array.isArray(body.rubric)).toBe(true);
    expect(body.rubric.length).toBeGreaterThanOrEqual(1);
    expect(body.rubric[0].evaluationArea).toBeTruthy();
    expect(body.rubric[0].detailedCriteria).toBeTruthy();
  });

  test("minimal required fields → 200", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/ai/generate-rubric", {
      data: {
        examTitle: "Quick Rubric Test",
        questions: [{ text: "Sample question" }],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.rubric).toBeTruthy();
    expect(Array.isArray(body.rubric)).toBe(true);
  });

  test("student cannot generate rubric → 403", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/ai/generate-rubric", {
      data: {
        examTitle: "Forbidden Test",
        questions: [{ text: "Sample" }],
      },
    });

    expect(res.status()).toBe(403);
  });

  test("anonymous user → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/ai/generate-rubric", {
      data: {
        examTitle: "Unauthorized Test",
        questions: [{ text: "Sample" }],
      },
    });

    expect(res.status()).toBe(401);
  });

  test("missing required fields → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/ai/generate-rubric", {
      data: {
        examTitle: "Missing Questions",
        // questions is required but missing
      },
    });

    expect(res.status()).toBe(400);
  });

  test("empty questions array → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/ai/generate-rubric", {
      data: {
        examTitle: "Empty Questions",
        questions: [],
      },
    });

    expect(res.status()).toBe(400);
  });
});
