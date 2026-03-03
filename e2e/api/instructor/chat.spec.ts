import { test, expect } from "../../fixtures/auth.fixture";

test.describe("GET/POST /api/instructor/chat — Instructor AI Chat", () => {
  test("GET health check → 200 { ok: true }", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.get("/api/instructor/chat");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("POST anon → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/instructor/chat", {
      data: {
        message: "hello",
        sessionId: "test",
        context: "test context",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("POST student → 403", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/instructor/chat", {
      data: {
        message: "hello",
        sessionId: "test",
        context: "test context",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("POST empty body → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/instructor/chat", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("POST missing context → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/instructor/chat", {
      data: {
        message: "hello",
        sessionId: "test-session",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST instructor chats → 200 with AI response", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/instructor/chat", {
      data: {
        message: "이 학생의 답안을 어떻게 평가할까요?",
        sessionId: "test-session-id",
        context:
          "학생 답안: 다형성은 OOP의 핵심 개념입니다. 서브클래스가 부모 클래스의 메서드를 재정의할 수 있습니다.",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response).toBeTruthy();
    expect(body.timestamp).toBeTruthy();
  });
});
