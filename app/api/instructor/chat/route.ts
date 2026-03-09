// Node.js Runtime 사용 (4MB → 25MB 업로드 한도 증가)
export const runtime = "nodejs";

// Route configuration
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { openai, AI_MODEL } from "@/lib/openai";
import { buildInstructorChatSystemPrompt } from "@/lib/prompts";

// Some environments may send OPTIONS (preflight) or GET accidentally.
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "*";
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}

export async function GET() {
  return NextResponse.json(
    { ok: true, route: "/api/instructor/chat", methods: ["POST", "OPTIONS"] },
    { status: 200, headers: { Allow: "POST, OPTIONS" } },
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
  previousResponseId: string | null = null,
): Promise<{ response: string; responseId: string }> {
  const aiStartTime = Date.now();
  try {
    if (process.env.NODE_ENV === "development") {
    }

    // Responses API 사용
    const response = await openai.responses.create({
      model: AI_MODEL,
      instructions: systemPrompt,
      input: userMessage,
      previous_response_id: previousResponseId || undefined,
      store: true,
    });

    // output 배열에서 메시지 타입 찾기
    let responseText = "";
    const outputArray = response.output as any;
    if (outputArray && Array.isArray(outputArray)) {
      const messageOutput = outputArray.find(
        (item: any) => item.type === "message" && item.content,
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
      `OpenAI Responses API failed: ${(openaiError as Error).message}`,
    );
  }
}

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  try {
    const body = (await request.json()) as InstructorChatRequestBody;

    const { message, sessionId, context, scopeDescription, userId } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Missing message field" },
        { status: 400 },
      );
    }

    if (!context) {
      return NextResponse.json(
        { error: "Missing context field" },
        { status: 400 },
      );
    }

    // 📊 사용자 활동 로그

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
      previousResponseId,
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
      { status: 500 },
    );
  }
}
