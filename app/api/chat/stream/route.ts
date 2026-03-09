// Streaming chat endpoint — returns SSE with token-by-token AI responses
// Falls back to non-streaming /api/chat if client doesn't support SSE

export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { getOpenAI, AI_MODEL } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import { searchRelevantMaterials } from "@/lib/material-search";
import { type RubricItem, buildStudentChatSystemPrompt } from "@/lib/prompts";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateRequest, chatRequestSchema } from "@/lib/validations";
import { logError } from "@/lib/logger";
import { currentUser } from "@/lib/get-current-user";
import { classifyMessageType, type MessageType } from "@/lib/message-classification";
import { extractResponseText } from "@/lib/parse-openai-response";

function getSupabase() {
  return getSupabaseServer();
}

function cleanContext(text: string): string {
  if (!text || typeof text !== "string") return "";
  let cleaned = text.replace(/\b([A-Za-z])(?:\s+\1){2,}\b/g, "");
  cleaned = cleaned.replace(/(.)\1{4,}/g, "");
  cleaned = cleaned.replace(/\b(\w+)(?:\s+\1){3,}\b/gi, "$1");
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const body = await request.json();

    const validation = validateRequest(chatRequestSchema, body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: "VALIDATION_ERROR", message: validation.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const {
      message,
      sessionId,
      questionId,
      questionIdx,
      examTitle: requestExamTitle,
      examCode: requestExamCode,
      examId,
      studentId,
      currentQuestionText,
      currentQuestionAiContext,
    } = validation.data;

    const user = await currentUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "UNAUTHORIZED" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    if (studentId && user.id !== studentId) {
      return new Response(
        JSON.stringify({ error: "FORBIDDEN" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const rateLimitKey = `chat:${user.id || sessionId}`;
    const rl = await checkRateLimitAsync(rateLimitKey, RATE_LIMITS.chat);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: "RATE_LIMITED" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    let safeQIdx: number;
    if (questionIdx !== undefined && questionIdx !== null) {
      const parsed = parseInt(String(questionIdx), 10);
      safeQIdx = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } else if (questionId) {
      const parsed = parseInt(String(questionId), 10);
      safeQIdx = Number.isFinite(parsed) && parsed >= 0 ? Math.abs(parsed % 2147483647) : 0;
    } else {
      safeQIdx = 0;
    }

    // Resolve session (temp or regular)
    let actualSessionId = sessionId;
    let skipIncrement = false;
    let examCode = requestExamCode || "TEMP";
    let rubric: RubricItem[] | undefined;
    let materialsText: Array<{ url: string; text: string; fileName: string }> | undefined;

    const isTemp = sessionId.startsWith("temp_");

    if (isTemp) {
      // Resolve temp session
      if (examId && studentId) {
        const { data: existingSession } = await getSupabase()
          .from("sessions")
          .select("id, used_clarifications")
          .eq("exam_id", examId)
          .eq("student_id", studentId)
          .single();

        if (existingSession) {
          actualSessionId = existingSession.id;
        } else {
          const { data: newSession } = await getSupabase()
            .from("sessions")
            .insert([{ exam_id: examId, student_id: studentId, used_clarifications: 1 }])
            .select("id")
            .single();
          if (newSession) {
            actualSessionId = newSession.id;
            skipIncrement = true;
          }
        }
      }
    } else {
      // Regular session — validate ownership + fetch exam context
      const { data: session, error: sessionError } = await getSupabase()
        .from("sessions")
        .select("id, exam_id, student_id")
        .eq("id", sessionId)
        .single();

      if (sessionError || !session) {
        return new Response(
          JSON.stringify({ error: "INVALID_SESSION" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      if (user && session.student_id && session.student_id !== user.id) {
        return new Response(
          JSON.stringify({ error: "FORBIDDEN" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      if (session.exam_id) {
        const { data: exam } = await getSupabase()
          .from("exams")
          .select("id, code, title, rubric, questions, materials_text")
          .eq("id", session.exam_id)
          .single();

        if (exam) {
          examCode = exam.code;
          if (Array.isArray(exam.questions) && exam.questions[safeQIdx]?.rubric?.length > 0) {
            rubric = exam.questions[safeQIdx].rubric as RubricItem[];
          } else if (Array.isArray(exam.rubric)) {
            rubric = exam.rubric as RubricItem[];
          }
          if (Array.isArray(exam.materials_text)) {
            materialsText = exam.materials_text as typeof materialsText;
          }
        }
      }
    }

    // Build RAG context + previous response ID in parallel
    const ragPromise = (async () => {
      if (!examId) return { text: "", topSimilarity: null, count: 0, method: "none" as const };
      try {
        const { searchMaterialChunks, formatSearchResultsAsContext } = await import("@/lib/search-chunks");
        const results = await searchMaterialChunks(message, {
          examId, matchThreshold: 0.2, matchCount: 5, route: "/api/chat/stream",
          userId: user.id, sessionId: actualSessionId, qIdx: safeQIdx,
          metadata: { source: "student_chat_rag_stream" },
        });
        if (results.length > 0) {
          return {
            text: cleanContext(formatSearchResultsAsContext(results)),
            topSimilarity: typeof results[0]?.similarity === "number" ? results[0].similarity : null,
            count: results.length,
            method: "vector" as const,
          };
        }
        // Keyword fallback
        let mats = materialsText;
        if (!mats) {
          const { data: examData } = await getSupabase()
            .from("exams").select("materials_text").eq("id", examId).single();
          if (examData?.materials_text && Array.isArray(examData.materials_text)) {
            mats = examData.materials_text as typeof materialsText;
          }
        }
        if (mats && mats.length > 0) {
          const kw = cleanContext(searchRelevantMaterials(mats, message, 3, 2000));
          return { text: kw, topSimilarity: null, count: kw.length > 0 ? 1 : 0, method: "keyword" as const };
        }
        return { text: "", topSimilarity: null, count: 0, method: "none" as const };
      } catch {
        return { text: "", topSimilarity: null, count: 0, method: "none" as const };
      }
    })();

    const prevIdPromise = actualSessionId.startsWith("temp_")
      ? Promise.resolve(null)
      : Promise.resolve(
          getSupabase()
            .from("messages")
            .select("response_id")
            .eq("session_id", actualSessionId)
            .eq("q_idx", safeQIdx)
            .eq("role", "ai")
            .not("response_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .single()
        )
          .then(({ data }) => data?.response_id || null)
          .catch(() => null);

    const messageTypePromise = classifyMessageType(message).catch(() => "other" as MessageType);

    const [rag, previousResponseId, messageType] = await Promise.all([
      ragPromise, prevIdPromise, messageTypePromise,
    ]);

    // Save user message (fire-and-forget, but await before stream ends)
    const saveUserMsgPromise = !actualSessionId.startsWith("temp_")
      ? getSupabase().from("messages").insert([{
          session_id: actualSessionId, q_idx: safeQIdx, role: "user", content: message,
          message_type: messageType,
          metadata: { rag: { topSimilarity: rag.topSimilarity, resultsCount: rag.count, method: rag.method } },
        }])
      : Promise.resolve({ error: null });

    // Build system prompt
    let ragWarning = "";
    if (rag.count === 0) {
      ragWarning = "\n\n[수업 자료 검색 결과 없음] 이 질문과 관련된 수업 자료를 찾지 못했습니다. 수업 자료에 없는 내용을 만들어내지 마세요. 모르면 모른다고 답하세요.";
    } else if (rag.topSimilarity !== null && rag.topSimilarity < 0.3) {
      ragWarning = "\n\n[관련성 낮음] 검색된 수업 자료의 관련성이 낮습니다. 답변 시 주의하고, 확신할 수 없는 내용은 추측하지 마세요.";
    }

    const systemPrompt = buildStudentChatSystemPrompt({
      examTitle: requestExamTitle,
      examCode,
      questionId,
      currentQuestionText,
      currentQuestionAiContext,
      relevantMaterialsText: rag.text,
      rubric,
    }) + ragWarning;

    // Create streaming response
    let isCancelled = false;
    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (data: string) => {
          if (isCancelled) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            isCancelled = true;
          }
        };

        try {
          const openai = getOpenAI();
          const streamResponse = await openai.responses.create({
            model: AI_MODEL,
            instructions: systemPrompt,
            input: message,
            previous_response_id: previousResponseId || undefined,
            store: true,
            stream: true,
          });

          let fullText = "";
          let responseId = "";

          for await (const event of streamResponse) {
            if (isCancelled) break;

            if (event.type === "response.output_text.delta") {
              const delta = (event as { delta?: string }).delta || "";
              if (delta) {
                fullText += delta;
                enqueue(delta);
              }
            } else if (event.type === "response.completed") {
              const resp = (event as { response?: { id?: string; output?: unknown[]; usage?: unknown } }).response;
              if (resp?.id) responseId = resp.id;
              // Extract full text from completed response if we missed any
              if (resp?.output) {
                const completedText = extractResponseText(
                  resp.output as Parameters<typeof extractResponseText>[0]
                );
                if (completedText && completedText.length > fullText.length) {
                  // Send remaining text
                  const remaining = completedText.slice(fullText.length);
                  if (remaining) enqueue(remaining);
                  fullText = completedText;
                }
              }
            }
          }

          // Signal end of stream
          if (!isCancelled) {
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          }

          // Save AI message to DB (must complete before request ends)
          if (!actualSessionId.startsWith("temp_") && fullText) {
            await saveUserMsgPromise;

            const aiInsert = await getSupabase().from("messages").insert([{
              session_id: actualSessionId,
              q_idx: safeQIdx,
              role: "ai",
              content: fullText,
              response_id: responseId || null,
              metadata: {
                rag: { topSimilarity: rag.topSimilarity, resultsCount: rag.count, method: rag.method },
                streaming: true,
              },
            }]);

            if (aiInsert.error) {
              logError("Error saving streamed AI message — retrying", aiInsert.error, { path: "/api/chat/stream" });
              await getSupabase().from("messages").insert([{
                session_id: actualSessionId, q_idx: safeQIdx, role: "ai",
                content: fullText, response_id: responseId || null,
                metadata: { rag: { topSimilarity: rag.topSimilarity, resultsCount: rag.count, method: rag.method }, streaming: true, _retried: true },
              }]);
            }

            // Increment clarifications
            if (!skipIncrement) {
              const { error: incError } = await getSupabase().rpc("increment_used_clarifications", {
                p_session_id: actualSessionId, p_amount: 1,
              });
              if (incError) logError("Error incrementing clarifications", incError, { path: "/api/chat/stream" });
            }
          }

          // Track AI usage (fire-and-forget)
          // The streaming API doesn't return usage in the same way, so we skip tracked response here.
          // The non-streaming fallback path handles this.

        } catch (error) {
          logError("Streaming chat error", error, { path: "/api/chat/stream" });
          if (!isCancelled) {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify("[ERROR]")}\n\n`));
            } catch { /* controller closed */ }
          }
        } finally {
          try {
            controller.close();
          } catch { /* already closed */ }
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
  } catch (error) {
    logError("Chat stream API error", error, { path: "/api/chat/stream" });
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message: "스트리밍 중 오류가 발생했습니다." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
