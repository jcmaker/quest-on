export const maxDuration = 60;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { generateRubricSchema, validateRequest } from "@/lib/validations";
import { buildRubricGenerationPrompt } from "@/lib/prompts";
import { getOpenAI, AI_MODEL } from "@/lib/openai";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";
import { getCachedAiResponse, setCachedAiResponse } from "@/lib/ai-cache";

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    const role = (user.role) || "student";
    if (role !== "instructor") {
      return errorJson("FORBIDDEN", "교수자만 루브릭을 생성할 수 있습니다.", 403);
    }

    const rl = await checkRateLimitAsync(`ai:generate-rubric:${user.id}`, RATE_LIMITS.ai);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please wait.", 429);
    }

    const body = await request.json();
    const validation = validateRequest(generateRubricSchema, body);
    if (!validation.success) {
      return errorJson("VALIDATION_ERROR", validation.error, 400);
    }

    const data = validation.data;

    // 캐시 확인: 동일 입력에 대한 이전 결과 재사용
    const cacheInput = { examTitle: data.examTitle, questions: data.questions, topics: data.topics, language: data.language };
    const cached = await getCachedAiResponse("generate-rubric", cacheInput);
    if (cached) {
      try {
        const parsedCache = JSON.parse(cached);
        if (parsedCache.rubric && Array.isArray(parsedCache.rubric)) {
          return successJson({ rubric: parsedCache.rubric });
        }
      } catch { /* corrupted cache — proceed with fresh call */ }
    }

    const { system, user: userPrompt } = buildRubricGenerationPrompt({
      examTitle: data.examTitle,
      questions: data.questions,
      topics: data.topics,
      language: data.language,
    });

    const tracked = await callTrackedChatCompletion(
      () =>
        getOpenAI().chat.completions.create({
          model: AI_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      {
        feature: "generate_rubric",
        route: "/api/ai/generate-rubric",
        model: AI_MODEL,
        userId: user.id,
        metadata: buildAiTextMetadata({
          inputText: [system, userPrompt],
          extra: {
            question_count: data.questions.length,
            topic_count: data.topics?.length ?? 0,
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

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      return errorJson("AI_GENERATION_FAILED", "AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.", 500);
    }

    if (!parsed.rubric || !Array.isArray(parsed.rubric)) {
      return errorJson("AI_GENERATION_FAILED", "AI 응답 형식이 올바르지 않습니다.", 500);
    }

    const rubric = parsed.rubric.map((item: { evaluationArea: string; detailedCriteria: string }) => ({
      evaluationArea: item.evaluationArea || "",
      detailedCriteria: item.detailedCriteria || "",
    }));

    // 캐시에 저장 (30분 TTL)
    setCachedAiResponse("generate-rubric", cacheInput, JSON.stringify({ rubric })).catch(() => {});

    return successJson({ rubric });
  } catch (error) {
    logError("Rubric generation failed", error, { path: "/api/ai/generate-rubric" });
    return errorJson("INTERNAL_ERROR", "루브릭 생성 중 오류가 발생했습니다.", 500);
  }
}
