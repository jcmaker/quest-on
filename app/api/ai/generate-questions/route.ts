export const maxDuration = 120;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { generateCaseQuestionsSchema, validateRequest } from "@/lib/validations";
import { buildCaseQuestionGenerationPrompt } from "@/lib/prompts";
import { openai, AI_MODEL, callOpenAI } from "@/lib/openai";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

const MATERIALS_CHAR_LIMIT = 8000;
const GENERATION_TIMEOUT_MS = 60_000;

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    const role = (user.unsafeMetadata?.role as string) || "student";
    if (role !== "instructor") {
      return errorJson("FORBIDDEN", "교수자만 문제를 생성할 수 있습니다.", 403);
    }

    // Rate limit: expensive OpenAI call
    const rl = await checkRateLimitAsync(`ai:generate-questions:${user.id}`, RATE_LIMITS.ai);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    // Validate body
    const body = await request.json();
    const validation = validateRequest(generateCaseQuestionsSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error, 400);
    }

    const data = validation.data;

    // Forward mock headers when running against mock server (OPENAI_BASE_URL points to localhost)
    const mockHeaders: Record<string, string> = {};
    const isMockServer = process.env.OPENAI_BASE_URL?.includes("localhost");
    if (isMockServer) {
      const mockError = request.headers.get("x-mock-error");
      if (mockError) mockHeaders["x-mock-error"] = mockError;
    }
    const hasMockHeaders = Object.keys(mockHeaders).length > 0;

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

    // Build prompt
    const { system, user: userPrompt } = buildCaseQuestionGenerationPrompt({
      examTitle: data.examTitle,
      difficulty: data.difficulty ?? "intermediate",
      questionCount: data.questionCount ?? 2,
      topics: data.topics,
      customInstructions: data.customInstructions,
      materialsContext,
    });

    // Call OpenAI with extended timeout for generation
    let parsedResponse: {
      questions: Array<{ text: string; type: string }>;
      suggestedRubric: Array<{
        evaluationArea: string;
        detailedCriteria: string;
      }>;
    };

    const attemptGeneration = async () => {
      const apiCall = () =>
        Promise.race([
          openai.chat.completions.create(
            {
              model: AI_MODEL,
              messages: [
                { role: "system", content: system },
                { role: "user", content: userPrompt },
              ],
              response_format: { type: "json_object" },
            },
            hasMockHeaders
              ? { headers: mockHeaders, maxRetries: 0 }
              : undefined,
          ),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Generation timeout")),
              GENERATION_TIMEOUT_MS
            )
          ),
        ]);

      // Skip callOpenAI wrapper (which has its own retries) when using mock server
      const completion = hasMockHeaders ? await apiCall() : await callOpenAI(apiCall);

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from AI");
      }

      return JSON.parse(content);
    };

    // Try generation with 1 retry on parse failure (skip retry for mock errors)
    try {
      parsedResponse = await attemptGeneration();
    } catch (firstError) {
      if (hasMockHeaders) {
        const msg =
          firstError instanceof Error ? firstError.message : "AI 응답 생성 실패";
        return errorJson("AI_GENERATION_FAILED", msg, 500);
      }
      try {
        parsedResponse = await attemptGeneration();
      } catch {
        const msg =
          firstError instanceof Error ? firstError.message : "AI 응답 생성 실패";
        return errorJson("AI_GENERATION_FAILED", msg, 500);
      }
    }

    // Validate and enrich questions
    if (
      !parsedResponse.questions ||
      !Array.isArray(parsedResponse.questions)
    ) {
      return errorJson(
        "AI_GENERATION_FAILED",
        "AI 응답 형식이 올바르지 않습니다.",
        500
      );
    }

    const questions = parsedResponse.questions.map((q) => ({
      id: crypto.randomUUID(),
      text: q.text,
      type: "essay" as const,
    }));

    const suggestedRubric = Array.isArray(parsedResponse.suggestedRubric)
      ? parsedResponse.suggestedRubric
      : [];

    return successJson({ questions, suggestedRubric });
  } catch (error) {
    logError("Question generation failed", error, { path: "/api/ai/generate-questions" });
    return errorJson("INTERNAL_ERROR", "문제 생성 중 오류가 발생했습니다.", 500);
  }
}
