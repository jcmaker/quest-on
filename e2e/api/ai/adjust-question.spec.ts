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
  });
});
