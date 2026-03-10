import express from "express";

const app = express();
app.use(express.json());

const PORT = Number(process.env.MOCK_SERVER_PORT) || 4010;

// ---------- Error simulation middleware ----------
app.use((req, res, next) => {
  const errorMode = req.headers["x-mock-error"] as string | undefined;
  if (!errorMode) return next();

  switch (errorMode) {
    case "rate_limit":
      return res.status(429).json({
        error: { message: "Rate limit exceeded", type: "rate_limit_error", code: "rate_limit_exceeded" },
      });
    case "server_error":
      return res.status(500).json({
        error: { message: "Internal server error", type: "server_error" },
      });
    case "timeout":
      return setTimeout(() => res.status(504).json({ error: { message: "Timeout" } }), 30_000);
    case "malformed":
      return res.status(200).send("not valid json {{{");
    default:
      return next();
  }
});

// ---------- Helpers ----------

function getSystemPrompt(body: Record<string, unknown>): string {
  const messages = body?.messages as Array<{ role: string; content: string }> | undefined;
  if (!messages) return "";
  const systemMsg = messages.find((m) => m.role === "system");
  return systemMsg?.content ?? "";
}

function chatCompletionResponse(content: string) {
  return {
    id: `chatcmpl-mock-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "gpt5.2-chat-latest",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

// ---------- POST /v1/chat/completions ----------
app.post("/v1/chat/completions", (req, res) => {
  const isJsonMode = req.body?.response_format?.type === "json_object";

  if (!isJsonMode) {
    // Non-JSON mode: grading / feedback response
    const content = JSON.stringify({
      score: 75,
      comment: "Good understanding of core concepts with room for improvement.",
      stage_grading: {
        chat: { score: 70, reasoning: "Adequate conversation quality" },
        answer: { score: 80, reasoning: "Solid answer with minor gaps" },
      },
    });
    return res.json(chatCompletionResponse(content));
  }

  // JSON mode — route by system prompt keyword
  const sysPrompt = getSystemPrompt(req.body);

  if (sysPrompt.includes("편집 어시스턴트")) {
    // adjust-question
    return res.json(chatCompletionResponse(JSON.stringify({
      questionText: "수정된 사례형 문제: AI 기술이 의료 산업에 미치는 영향을 분석하고, 구체적인 사례를 들어 설명하시오.",
      explanation: "지시에 따라 문제를 더 구체적이고 분석적인 형태로 수정했습니다.",
    })));
  }

  if (sysPrompt.includes("전문 교육가")) {
    // generate-summary
    return res.json(chatCompletionResponse(JSON.stringify({
      sentiment: "positive",
      summary: "학생은 핵심 개념에 대한 이해도가 높으며, 논리적 전개가 우수합니다.",
      strengths: ["개념 이해도가 높음", "논리적 전개력이 우수함", "구체적 사례 활용"],
      weaknesses: ["일부 세부사항 누락", "결론 부분 보강 필요"],
      keyQuotes: ["다형성은 OOP의 핵심 원칙입니다", "상속보다 합성을 선호해야 합니다"],
    })));
  }

  if (sysPrompt.includes("전문 평가위원")) {
    // auto-grade (unified grading expects chat_score/answer_score fields)
    return res.json(chatCompletionResponse(JSON.stringify({
      chat_score: 70,
      chat_comment: "Adequate conversation quality with good questions asked.",
      answer_score: 80,
      answer_comment: "Solid answer with minor gaps in explanation.",
      overall_comment: "Good understanding of core concepts with room for improvement.",
      rubric_scores: {},
      sentiment: "positive",
      summary: "학생은 핵심 개념에 대한 이해도가 높으며, 논리적 전개가 우수합니다.",
      strengths: ["개념 이해도가 높음", "논리적 전개력이 우수함"],
      weaknesses: ["일부 세부사항 누락"],
      keyQuotes: ["다형성은 OOP의 핵심 원칙입니다", "상속보다 합성을 선호해야 합니다"],
    })));
  }

  // Default: question generation
  return res.json(chatCompletionResponse(JSON.stringify({
    questions: [
      {
        text: "Explain the concept of polymorphism in Object-Oriented Programming with examples.",
        type: "essay",
      },
      {
        text: "Compare and contrast inheritance and composition. When would you use each?",
        type: "essay",
      },
    ],
    suggestedRubric: [
      {
        evaluationArea: "Conceptual Understanding",
        detailedCriteria: "Demonstrates clear understanding of core OOP concepts.",
      },
      {
        evaluationArea: "Practical Application",
        detailedCriteria: "Provides relevant real-world examples.",
      },
    ],
  })));
});

// ---------- POST /v1/responses ----------
app.post("/v1/responses", (req, res) => {
  const responseId = `resp-mock-${Date.now()}`;
  const mockText = "This is a mock AI response for testing. The concept involves understanding the fundamental principles discussed in class.";

  if (req.body?.stream === true) {
    // SSE streaming mode
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send text in chunks
    const chunks = mockText.match(/.{1,20}/g) || [mockText];
    for (const chunk of chunks) {
      res.write(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: chunk })}\n\n`);
    }

    // Send completed event
    const completedResponse = {
      id: responseId,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      model: "gpt5.2-chat-latest",
      status: "completed",
      output: [
        {
          type: "message",
          id: `msg-mock-${Date.now()}`,
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: mockText, annotations: [] }],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    };
    res.write(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: completedResponse })}\n\n`);
    res.end();
    return;
  }

  // Non-streaming JSON response
  res.json({
    id: responseId,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model: "gpt5.2-chat-latest",
    status: "completed",
    error: null,
    incomplete_details: null,
    output: [
      {
        type: "message",
        id: `msg-mock-${Date.now()}`,
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: mockText,
            annotations: [],
          },
        ],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  });
});

// ---------- POST /v1/embeddings ----------
app.post("/v1/embeddings", (req, res) => {
  const input = req.body.input;
  const inputs = Array.isArray(input) ? input : [input];

  res.json({
    object: "list",
    data: inputs.map((_: unknown, i: number) => ({
      object: "embedding",
      index: i,
      embedding: Array.from({ length: 1536 }, () =>
        Number((Math.random() * 2 - 1).toFixed(6))
      ),
    })),
    model: "text-embedding-3-small",
    usage: { prompt_tokens: 10, total_tokens: 10 },
  });
});

// ---------- Health check ----------
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ---------- Catch-all for unhandled routes ----------
app.all("/{*path}", (req, res) => {
  console.warn(`[mock-server] Unhandled: ${req.method} ${req.url}`);
  res.status(404).json({ error: "Not found in mock server" });
});

app.listen(PORT, () => {
  // This message is checked by global-setup.ts
  console.log(`Mock server listening on port ${PORT}`);
});
