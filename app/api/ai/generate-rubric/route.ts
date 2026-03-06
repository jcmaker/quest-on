export const maxDuration = 60;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { generateRubricSchema, validateRequest } from "@/lib/validations";
import { buildRubricGenerationPrompt } from "@/lib/prompts";
import { openai, AI_MODEL, callOpenAI } from "@/lib/openai";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    const role = (user.unsafeMetadata?.role as string) || "student";
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

    const { system, user: userPrompt } = buildRubricGenerationPrompt({
      examTitle: data.examTitle,
      questions: data.questions,
      topics: data.topics,
    });

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
    if (!content) {
      return errorJson("AI_GENERATION_FAILED", "AI 응답이 비어있습니다.", 500);
    }

    const parsed = JSON.parse(content);

    if (!parsed.rubric || !Array.isArray(parsed.rubric)) {
      return errorJson("AI_GENERATION_FAILED", "AI 응답 형식이 올바르지 않습니다.", 500);
    }

    const rubric = parsed.rubric.map((item: { evaluationArea: string; detailedCriteria: string }) => ({
      evaluationArea: item.evaluationArea || "",
      detailedCriteria: item.detailedCriteria || "",
    }));

    return successJson({ rubric });
  } catch (error) {
    logError("Rubric generation failed", error, { path: "/api/ai/generate-rubric" });
    return errorJson("INTERNAL_ERROR", "루브릭 생성 중 오류가 발생했습니다.", 500);
  }
}
