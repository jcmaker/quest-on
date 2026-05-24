import { test, expect } from "../../fixtures/auth.fixture";

test.describe("POST /api/ai/adjust-question — AI Question Adjustment", () => {
  const validPayload = {
    questionText: "다형성의 개념을 설명하시오.",
    instruction: "더 구체적인 사례를 포함하도록 수정해주세요",
  };

  test("anon → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/ai/adjust-question", {
      data: validPayload,
    });
    expect(res.status()).toBe(401);
  });

  test("student → 403", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/ai/adjust-question", {
      data: validPayload,
    });
    expect(res.status()).toBe(403);
  });

  test("empty body → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/ai/adjust-question", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("missing instruction → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/ai/adjust-question", {
      data: { questionText: "다형성의 개념을 설명하시오." },
    });
    expect(res.status()).toBe(400);
  });

  test("instructor adjusts question → 200 with adjusted text", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/ai/adjust-question", {
      data: validPayload,
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.questionText).toBeTruthy();
    expect(body.explanation).toBeDefined();
    // essay 응답은 객관식 필드를 포함하지 않는다 (하위 호환).
    expect(body.options).toBeUndefined();
    expect(body.correctOptionIndex).toBeUndefined();
  });

  test("explicit essay questionType → 200, essay shape only", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/ai/adjust-question", {
      data: { ...validPayload, questionType: "essay" },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.questionText).toBeTruthy();
    expect(body.explanation).toBeDefined();
    expect(body.options).toBeUndefined();
  });

  test("multiple-choice questionType → 200 with 4 options + valid answer index", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/ai/adjust-question", {
      data: {
        questionText: "다형성(polymorphism)에 대한 설명으로 옳은 것은?",
        instruction: "오답 선택지를 더 그럴듯하게 다듬어 주세요",
        questionType: "multiple-choice",
        examTitle: "OOP 기초",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.questionText).toBeTruthy();
    expect(Array.isArray(body.options)).toBe(true);
    expect(body.options.length).toBe(4);
    expect(typeof body.correctOptionIndex).toBe("number");
    expect(body.correctOptionIndex).toBeGreaterThanOrEqual(0);
    expect(body.correctOptionIndex).toBeLessThanOrEqual(3);
    expect(body.explanation).toBeDefined();
  });

  test("multiple-choice iterates on provided draft → 200 with 4 options", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/ai/adjust-question", {
      data: {
        questionText: "다음 중 상속(inheritance)의 목적으로 가장 적절한 것은?",
        instruction: "정답은 그대로 두고 선택지 표현만 더 명확하게 수정해 주세요",
        questionType: "multiple-choice",
        currentOptions: ["코드 재사용", "메모리 절약", "보안 강화", "네트워크 속도 향상"],
        currentCorrectOptionIndex: 0,
        examTitle: "OOP 기초",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.questionText).toBeTruthy();
    expect(Array.isArray(body.options)).toBe(true);
    expect(body.options.length).toBe(4);
    expect(body.correctOptionIndex).toBeGreaterThanOrEqual(0);
    expect(body.correctOptionIndex).toBeLessThanOrEqual(3);
  });

  test("true-false questionType → 200 with O/X options + valid answer index", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/ai/adjust-question", {
      data: {
        questionText: "다형성은 객체가 여러 형태를 가질 수 있게 한다.",
        instruction: "진술을 더 명확한 단일 문장으로 다듬어 주세요",
        questionType: "true-false",
        examTitle: "OOP 기초",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.questionText).toBeTruthy();
    expect(Array.isArray(body.options)).toBe(true);
    expect(body.options.length).toBe(2);
    expect(typeof body.correctOptionIndex).toBe("number");
    expect(body.correctOptionIndex).toBeGreaterThanOrEqual(0);
    expect(body.correctOptionIndex).toBeLessThanOrEqual(1);
    expect(body.explanation).toBeDefined();
  });
});
