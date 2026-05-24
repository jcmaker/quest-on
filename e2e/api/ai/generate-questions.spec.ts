import { test, expect } from "../../fixtures/auth.fixture";
import { cleanupTestData } from "../../helpers/seed";

test.describe("AI — POST /api/ai/generate-questions", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("instructor generates questions → 200, returns questions", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/ai/generate-questions", {
      data: {
        examTitle: "OOP Fundamentals",
        difficulty: "intermediate",
        questionCount: 2,
        topics: "polymorphism, inheritance",
        customInstructions: "Focus on practical examples",
        materialsText: [
          {
            url: "https://example.com/lecture-notes.pdf",
            fileName: "lecture-notes.pdf",
            text: "Polymorphism allows objects to take many forms. Inheritance enables code reuse.",
          },
        ],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();

    // Questions
    expect(body.questions).toBeTruthy();
    expect(Array.isArray(body.questions)).toBe(true);
    expect(body.questions.length).toBeGreaterThanOrEqual(1);
    expect(body.questions[0].id).toBeTruthy(); // UUID assigned
    expect(body.questions[0].text).toBeTruthy();
    expect(body.questions[0].type).toBe("essay");

    // `successJson` wraps responses with a `success: true` envelope, so the
    // body contains both `success` and `questions`. We only care that the
    // questions payload is present and well-shaped.
    expect(body).toMatchObject({ questions: expect.any(Array) });
  });

  test("minimal required fields → 200", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/ai/generate-questions", {
      data: {
        examTitle: "Quick Test",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.questions).toBeTruthy();
    expect(Array.isArray(body.questions)).toBe(true);
  });

  test("student cannot generate questions → 403", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.post("/api/ai/generate-questions", {
      data: {
        examTitle: "Test Exam",
        difficulty: "basic",
        questionCount: 1,
      },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("FORBIDDEN");
  });

  test("anon cannot generate questions → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/ai/generate-questions", {
      data: {
        examTitle: "Test Exam",
      },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHORIZED");
  });

  test("empty body fails validation → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/ai/generate-questions", {
      data: {},
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });
});
