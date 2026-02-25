// Node.js Runtime 사용 (4MB → 25MB 업로드 한도 증가)
export const runtime = "nodejs";

// Route configuration
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { openai, AI_MODEL } from "@/lib/openai";
import { buildInstructorChatSystemPrompt } from "@/lib/prompts";
import { handleCorsPreFlight } from "@/lib/cors";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { validateRequest, instructorChatRequestSchema } from "@/lib/validations";

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request);
}

export async function GET() {
  console.log("[instructor-chat] GET /api/instructor/chat (healthcheck)");
  return NextResponse.json(
    { ok: true, route: "/api/instructor/chat", methods: ["POST", "OPTIONS"] },
    { status: 200, headers: { Allow: "POST, OPTIONS" } }
  );
}

type InstructorChatRequestBody = {
  message: string;
  sessionId: string;
  context: string;
  scopeDescription?: string;
  userId?: string;
};

// 공통 Completion 함수 - Responses API 사용
async function getAIResponse(
  systemPrompt: string,
  userMessage: string,
  previousResponseId: string | null = null
): Promise<{ response: string; responseId: string }> {
  const aiStartTime = Date.now();
  try {
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[instructor-chat] Calling OpenAI Responses API with prompt length:",
        systemPrompt.length,
        "| Previous response ID:",
        previousResponseId || "none (first message)"
      );
    }

    // Responses API 사용
    const response = await openai.responses.create({
      model: AI_MODEL,
      instructions: systemPrompt,
      input: userMessage,
      previous_response_id: previousResponseId || undefined,
      store: true,
    });

    const aiDuration = Date.now() - aiStartTime;
    console.log(
      `⏱️  [PERFORMANCE] OpenAI Responses API response time: ${aiDuration}ms`
    );

    if (process.env.NODE_ENV === "development") {
      console.log("[instructor-chat] OpenAI Responses API response received:", {
        responseId: response.id,
        hasOutput: !!response.output,
        outputLength: response.output?.length || 0,
      });
    }

    // output 배열에서 메시지 타입 찾기
    let responseText = "";
    const outputArray = response.output as any;
    if (outputArray && Array.isArray(outputArray)) {
      const messageOutput = outputArray.find(
        (item: any) => item.type === "message" && item.content
      );

      if (messageOutput && Array.isArray(messageOutput.content)) {
        const textParts = messageOutput.content
          .filter((part: any) => part.type === "output_text" && part.text)
          .map((part: any) => part.text);
        responseText = textParts.join("");
      }
    }

    if (!responseText || responseText.trim().length === 0) {
      console.warn("[instructor-chat] OpenAI returned empty or null response");
      return {
        response:
          "죄송합니다. 질문을 처리하는 중에 문제가 발생했습니다. 다시 시도해주세요.",
        responseId: response.id,
      };
    }

    return {
      response: responseText,
      responseId: response.id,
    };
  } catch (openaiError) {
    console.error("[instructor-chat] OpenAI Responses API error:", openaiError);
    throw new Error(
      `OpenAI Responses API failed: ${(openaiError as Error).message}`
    );
  }
}

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  try {
    // Authentication check
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    // Rate limiting
    const rl = checkRateLimit(`instructor-chat:${user.id}`, RATE_LIMITS.ai);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Input validation
    const validation = validateRequest(instructorChatRequestSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const { message, sessionId, context, scopeDescription, userId } = validation.data;

    // 교수용 프롬프트 생성
    const systemPrompt = buildInstructorChatSystemPrompt({
      context,
      scopeDescription,
    });

    // 이전 응답 ID는 사용하지 않음 (교수용은 대화 히스토리 관리가 다를 수 있음)
    const previousResponseId = null;

    const { response: aiResponse } = await getAIResponse(
      systemPrompt,
      message,
      previousResponseId
    );

    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Total request time (instructor-chat): ${requestDuration}ms`
    );

    return NextResponse.json({
      response: aiResponse,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[instructor-chat] Chat API error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("[instructor-chat] Chat API error details:", {
      message: errorMessage,
      stack: errorStack,
      errorType: typeof error,
    });

    return NextResponse.json(
      {
        error: "Internal server error",
        message:
          "죄송합니다. 응답을 생성하는 중에 오류가 발생했습니다. 다시 시도해주세요.",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
