export const maxDuration = 60;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { adjustCaseQuestionSchema, validateRequest } from "@/lib/validations";
import { buildCaseQuestionAdjustmentPrompt } from "@/lib/prompts";
import { openai, AI_MODEL } from "@/lib/openai";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    const role = (user.unsafeMetadata?.role as string) || "student";
    if (role !== "instructor") {
      return errorJson("FORBIDDEN", "교수자만 문제를 수정할 수 있습니다.", 403);
    }

    // Rate limiting
    const rl = await checkRateLimitAsync(`adjust-question:${user.id}`, RATE_LIMITS.ai);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // Validate body
    const body = await request.json();
    const validation = validateRequest(adjustCaseQuestionSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error, 400);
    }

    const data = validation.data;

    // Build prompt
    const { system, user: userPrompt } = buildCaseQuestionAdjustmentPrompt({
      currentQuestionText: data.questionText,
      instruction: data.instruction,
      conversationHistory: data.conversationHistory,
      examTitle: data.examTitle,
    });

    // Call OpenAI
    const tracked = await callTrackedChatCompletion(
      () =>
        openai.chat.completions.create({
          model: AI_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      {
        feature: "adjust_question",
        route: "/api/ai/adjust-question",
        model: AI_MODEL,
        userId: user.id,
        metadata: buildAiTextMetadata({
          inputText: [system, userPrompt],
          extra: {
            conversation_turns: data.conversationHistory?.length ?? 0,
          },
        }),
      },
      {
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText:
              (result as { choices?: Array<{ message?: { content?: string | null } }> })
                .choices?.[0]?.message?.content ?? null,
          }),
      }
    );
    const completion = tracked.data;

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return errorJson("AI_GENERATION_FAILED", "AI 응답이 비어있습니다.", 500);
    }

    let parsed: { questionText: string; explanation: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      return errorJson(
        "AI_GENERATION_FAILED",
        "AI 응답을 파싱할 수 없습니다.",
        500
      );
    }

    if (!parsed.questionText) {
      return errorJson(
        "AI_GENERATION_FAILED",
        "AI 응답 형식이 올바르지 않습니다.",
        500
      );
    }

    return successJson({
      questionText: parsed.questionText,
      explanation: parsed.explanation || "",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "문제 수정 중 오류가 발생했습니다.";
    return errorJson("INTERNAL_ERROR", message, 500);
  }
}
