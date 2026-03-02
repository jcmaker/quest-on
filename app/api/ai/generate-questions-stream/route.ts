import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { errorJson } from "@/lib/api-response";
import { generateCaseQuestionsSchema, validateRequest } from "@/lib/validations";
import { buildSingleCaseQuestionPrompt } from "@/lib/prompts";
import { openai, AI_MODEL, callOpenAI } from "@/lib/openai";

const MATERIALS_CHAR_LIMIT = 8000;
const MAX_ATTEMPTS = 2; // 1 retry on parse failure

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

interface ParsedQuestionResponse {
  questions: Array<{ text: string; type: string }>;
  suggestedRubric?: Array<{
    evaluationArea: string;
    detailedCriteria: string;
  }>;
}

/** Single question generation with 1 retry on parse failure */
async function generateSingleQuestion(
  system: string,
  userPrompt: string
): Promise<ParsedQuestionResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const completion = await callOpenAI(() =>
        openai.chat.completions.create({
          model: AI_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        })
      );

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("Empty response from AI");

      return JSON.parse(content) as ParsedQuestionResponse;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_ATTEMPTS - 1) continue;
    }
  }

  throw lastError!;
}

export async function POST(request: NextRequest) {
  // ── Auth & validation (before streaming starts) ──
  const user = await currentUser();
  if (!user) {
    return errorJson("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  }

  const role = (user.unsafeMetadata?.role as string) || "student";
  if (role !== "instructor") {
    return errorJson("FORBIDDEN", "교수자만 문제를 생성할 수 있습니다.", 403);
  }

  const body = await request.json();
  const validation = validateRequest(generateCaseQuestionsSchema, body);
  if (!validation.success) {
    return errorJson("VALIDATION_ERROR", validation.error, 400);
  }

  const data = validation.data;
  const questionCount = data.questionCount ?? 2;
  const difficulty = data.difficulty ?? "intermediate";

  // Combine materials text with char limit
  let materialsContext: string | undefined;
  if (data.materialsText && data.materialsText.length > 0) {
    const combined = data.materialsText
      .map((m) => `[${m.fileName}]\n${m.text}`)
      .join("\n\n---\n\n");
    materialsContext =
      combined.length > MATERIALS_CHAR_LIMIT
        ? combined.slice(0, MATERIALS_CHAR_LIMIT) + "\n...(이하 생략)"
        : combined;
  }

  // ── SSE stream ──
  const encoder = new TextEncoder();
  let isCancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, payload: unknown) => {
        if (isCancelled) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(event, payload)));
        } catch {
          isCancelled = true;
        }
      };

      try {
        enqueue("progress", {
          stage: "started",
          current: 0,
          total: questionCount,
        });

        // Build prompts for each question
        const prompts = Array.from({ length: questionCount }, (_, i) =>
          buildSingleCaseQuestionPrompt({
            examTitle: data.examTitle,
            difficulty,
            questionIndex: i,
            totalQuestions: questionCount,
            topics: data.topics,
            customInstructions: data.customInstructions,
            materialsContext,
          })
        );

        let completedCount = 0;
        let successCount = 0;
        let rubricSent = false;

        enqueue("progress", {
          stage: "generating",
          current: 0,
          total: questionCount,
        });

        // Generate all questions in parallel, stream results as they complete
        const settled = prompts.map((prompt, i) =>
          generateSingleQuestion(prompt.system, prompt.user)
            .then((parsed) => {
              if (isCancelled) return;
              completedCount++;
              successCount++;

              const q = parsed.questions?.[0];
              if (q) {
                enqueue("question", {
                  question: {
                    id: crypto.randomUUID(),
                    text: q.text,
                    type: "essay" as const,
                  },
                  index: i,
                });
              }

              // Use rubric from the first successful response
              if (!rubricSent && parsed.suggestedRubric?.length) {
                enqueue("rubric", {
                  suggestedRubric: parsed.suggestedRubric,
                });
                rubricSent = true;
              }

              enqueue("progress", {
                stage: "generating",
                current: completedCount,
                total: questionCount,
              });
            })
            .catch((err) => {
              if (isCancelled) return;
              completedCount++;
              const message =
                err instanceof Error ? err.message : "문제 생성 실패";
              enqueue("error", {
                message: `문제 ${i + 1} 생성 실패: ${message}`,
                index: i,
                partial: true,
              });

              enqueue("progress", {
                stage: "generating",
                current: completedCount,
                total: questionCount,
              });
            })
        );

        await Promise.allSettled(settled);

        if (!isCancelled) {
          enqueue("complete", {
            totalQuestions: questionCount,
            successCount,
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "문제 생성 중 오류가 발생했습니다.";
        enqueue("error", { message, partial: false });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
    cancel() {
      isCancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
