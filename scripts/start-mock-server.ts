import express from "express";

const app = express();
app.use(express.json());

const PORT = Number(process.env.MOCK_SERVER_PORT) || 4010;

// ---------- POST /v1/chat/completions ----------
app.post("/v1/chat/completions", (_req, res) => {
  res.json({
    id: "chatcmpl-mock-001",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "gpt5.2-chat-latest",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: JSON.stringify({
            score: 75,
            comment: "Good understanding of core concepts with room for improvement.",
            stage_grading: {
              chat: { score: 70, reasoning: "Adequate conversation quality" },
              answer: { score: 80, reasoning: "Solid answer with minor gaps" },
            },
          }),
        },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  });
});

// ---------- POST /v1/responses ----------
app.post("/v1/responses", (_req, res) => {
  res.json({
    id: "resp-mock-001",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model: "gpt5.2-chat-latest",
    output: [
      {
        type: "message",
        id: "msg-mock-001",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "This is a mock AI response for testing. The concept involves understanding the fundamental principles discussed in class.",
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
