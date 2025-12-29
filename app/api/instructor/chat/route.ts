// Node.js Runtime 사용 (4MB → 25MB 업로드 한도 증가)
export const runtime = "nodejs";

// Route configuration
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { openai, AI_MODEL } from "@/lib/openai";

// Some environments may send OPTIONS (preflight) or GET accidentally.
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "*";
  console.log("[instructor-chat] OPTIONS /api/instructor/chat (preflight)", {
    origin,
    contentType: request.headers.get("content-type"),
    userAgent: request.headers.get("user-agent")?.slice(0, 80),
  });
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

function buildInstructorSystemPrompt(params: {
  context: string;
  scopeDescription?: string;
}): string {
  const { context, scopeDescription = "이 페이지의 데이터" } = params;

  return `
당신은 대학 강의의 교수자(Professor)로서 시험 관리 및 채점을 보조하는 AI 어시스턴트입니다.

**제공된 컨텍스트:**
${context}

**답변 범위:**
- ${scopeDescription} 범위 안에서만 답변합니다.
- 제공된 컨텍스트에 없는 정보는 추측하지 않습니다.
- 컨텍스트에 명시된 데이터를 바탕으로 정확하고 도움이 되는 답변을 제공합니다.

**역할(Role):**
- 시험 관리 및 채점을 보조하는 교수자 어시스턴트
- 학생 답안 평가, 피드백 작성, 시험 통계 분석 등을 도와줍니다
- 교수자의 의사결정을 돕기 위해 명확하고 구체적인 정보를 제공합니다

**규칙(Rules):**
- 항상 **마크다운** 형식으로 대답합니다.
- 정중하고 전문적인 톤을 유지합니다 (~습니다, ~입니다 체 사용).
- 필요시 구체적인 예시나 제안을 포함합니다.
- 데이터가 있는 경우 숫자와 통계를 활용하여 답변합니다.
- 채점 관련 질문의 경우 평가 기준과 함께 답변합니다.
- 시험 관리 관련 질문의 경우 실용적인 조언을 제공합니다.

**답변 스타일:**
- 간결하면서도 충분한 정보를 제공합니다.
- 구조화된 형식(목록, 표 등)을 적절히 활용합니다.
- 중요한 정보는 강조 표시(**굵게**)를 사용합니다.
`.trim();
}

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  try {
    console.log("[instructor-chat] incoming request", {
      method: request.method,
      path: request.nextUrl?.pathname,
      contentType: request.headers.get("content-type"),
      origin: request.headers.get("origin"),
      referer: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent")?.slice(0, 80),
    });

    const body = (await request.json()) as InstructorChatRequestBody;

    const { message, sessionId, context, scopeDescription, userId } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Missing message field" },
        { status: 400 }
      );
    }

    if (!context) {
      return NextResponse.json(
        { error: "Missing context field" },
        { status: 400 }
      );
    }

    // 📊 사용자 활동 로그
    console.log(
      `👤 [INSTRUCTOR_ACTIVITY] User ${
        userId || "unknown"
      } | Session ${sessionId} | Scope: ${scopeDescription || "N/A"}`
    );

    // 교수용 프롬프트 생성
    const systemPrompt = buildInstructorSystemPrompt({
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
