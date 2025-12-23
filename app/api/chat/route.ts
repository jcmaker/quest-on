// Node.js Runtime 사용 (4MB → 25MB 업로드 한도 증가)
export const runtime = "nodejs";

// Route configuration
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { openai, AI_MODEL } from "@/lib/openai";
import { createClient } from "@supabase/supabase-js";
import { searchRelevantMaterials } from "@/lib/material-search";

// Some environments may send OPTIONS (preflight) or GET accidentally.
// If we don't handle them, Next can return a non-JSON 405 which breaks clients expecting JSON.
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "*";
  console.log("[chat] OPTIONS /api/chat (preflight)", {
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
  console.log("[chat] GET /api/chat (healthcheck)");
  return NextResponse.json(
    { ok: true, route: "/api/chat", methods: ["POST", "OPTIONS"] },
    { status: 200, headers: { Allow: "POST, OPTIONS" } }
  );
}

// Supabase 서버 전용 클라이언트 (절대 클라이언트에 노출 금지)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, // 서버 전용 env 사용 (NEXT_PUBLIC은 브라우저에서도 접근 가능하지만 서버에서는 안전하게 사용)
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type MessageType = "concept" | "calculation" | "strategy" | "other";

type RubricItem = {
  evaluationArea: string;
  detailedCriteria: string;
};

type RagResult = {
  relevantMaterialsText: string;
  topSimilarity: number | null;
  resultsCount: number;
  method: "vector" | "keyword" | "none";
};

type ChatRequestBody = {
  message: string;
  sessionId: string;
  questionId?: string;
  questionIdx?: number | string;
  examTitle?: string;
  examCode?: string;
  examId?: string;
  studentId?: string;
  currentQuestionText?: string;
  currentQuestionAiContext?: string;
};

// 메시지 타입 분류 함수 (개념/계산/전략/기타)
async function classifyMessageType(message: string): Promise<MessageType> {
  try {
    // 간단한 키워드 기반 분류 (빠른 응답을 위해)
    const lowerMessage = message.toLowerCase();

    // 계산 관련 키워드
    if (
      /\d+|\+|\-|\*|\/|계산|연산|공식|수식|값|결과/.test(lowerMessage) ||
      /how much|calculate|compute|solve|equation/.test(lowerMessage)
    ) {
      return "calculation";
    }

    // 전략/방법 관련 키워드
    if (
      /방법|전략|접근|절차|과정|어떻게|how to|way|method|strategy|approach/.test(
        lowerMessage
      )
    ) {
      return "strategy";
    }

    // 개념 관련 키워드
    if (
      /무엇|뭐|의미|정의|개념|이유|왜|what|meaning|definition|concept|why/.test(
        lowerMessage
      )
    ) {
      return "concept";
    }

    // 기본값: 기타
    return "other";
  } catch (error) {
    console.error("Error classifying message type:", error);
    return "other";
  }
}

// 수업 자료 컨텍스트 정제 (노이즈 제거)
function cleanContext(text: string): string {
  if (!text || typeof text !== "string") return "";

  // 예: "G G G" / "A A A A" 같은 단일 문자 반복 제거
  let cleaned = text.replace(/\b([A-Za-z])(?:\s+\1){2,}\b/g, "");

  // 예: "GGGGGG" 같은 동일 문자 과도 반복 제거
  cleaned = cleaned.replace(/(.)\1{4,}/g, "");

  // 예: 동일 단어 4회 이상 반복 제거 (공백/줄바꿈 포함)
  cleaned = cleaned.replace(/\b(\w+)(?:\s+\1){3,}\b/gi, "$1");

  // 공백 정리
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function buildMaterialsPriorityInstruction(): string {
  return `
**[수업 자료 우선 원칙]**
- 아래에 [수업 자료 참고 내용]이 제공되면, 그것이 **최우선 근거**입니다.
- 수업 자료와 충돌하는 추측/일반론은 금지합니다.
- 수업 자료에 근거가 없으면 다음과 같은 프롬프트만 적용 시킨다 '
   역할(Role):
      - 너는 특정한 가상의 상황을 가정하고 문제를 출제했다. 학생이 묻는 질문에는 반드시 너가 가정한 '특정한 가상의 상황'에 기반해서 답해줘
      - 너는 대학 강의의 교수자(Professor) 역할이다.     
      - 답변은 실제 교수-학생의 질의응답처럼 진행한다. 

      규칙(Rules):
      - 너는 항상 **마크다운** 형식으로 대답한다.
      - ~ㅂ니다 라는 말을 사용한다.
      - 학생이 정보를 묻는 질문에는 오직 사실 정보만 응답한다.
      - 정보를 묻는 질문에는 반드시 문장은 최대 한 문장으로 제한한다.
      - 생성형 요청 질문에는 성실하게 답변한다.
      - 설명, 맥락, 해설, 코멘트, 판단은 절대 금지.
      - 질문에 직접 대응되지 않는 정보는 제공하지 않는다.
    '
`.trim();
}

async function getRagContext(params: {
  message: string;
  examId?: string;
  examMaterialsText?: Array<{ url: string; text: string; fileName: string }>;
}): Promise<RagResult> {
  const { message, examId, examMaterialsText } = params;
  if (!examId) {
    return {
      relevantMaterialsText: "",
      topSimilarity: null,
      resultsCount: 0,
      method: "none",
    };
  }

  try {
    console.log("🔍 [chat] RAG 벡터 검색 시작:", {
      examId,
      questionPreview: message.substring(0, 100),
    });

    const { searchMaterialChunks, formatSearchResultsAsContext } = await import(
      "@/lib/search-chunks"
    );

    const searchResults = await searchMaterialChunks(message, {
      examId,
      matchThreshold: 0.2, // 실제 유사도가 0.2~0.4 정도이므로 낮춤
      matchCount: 5,
    });

    const topSimilarityRaw = searchResults[0]?.similarity;
    const topSimilarity =
      typeof topSimilarityRaw === "number" ? topSimilarityRaw : null;

    console.log("📊 [chat] 벡터 검색 결과:", {
      resultsCount: searchResults.length,
      topSimilarity: topSimilarity?.toFixed(3) ?? "N/A",
      fileNames: searchResults.map(
        (r: any) => r.metadata?.fileName || "unknown"
      ),
    });

    if (searchResults.length > 0) {
      const context = formatSearchResultsAsContext(searchResults);
      const cleaned = cleanContext(context);
      console.log("✅ [chat] 컨텍스트 생성 완료:", {
        contextLength: cleaned.length,
        preview: cleaned.substring(0, 200),
      });
      return {
        relevantMaterialsText: cleaned,
        topSimilarity,
        resultsCount: searchResults.length,
        method: "vector",
      };
    }

    console.log("⚠️ [chat] 벡터 검색 결과 없음, 키워드 검색으로 폴백");

    let materials = examMaterialsText;
    if (!materials) {
      const { data: examData } = await supabase
        .from("exams")
        .select("materials_text")
        .eq("id", examId)
        .single();

      if (examData?.materials_text && Array.isArray(examData.materials_text)) {
        materials = examData.materials_text as Array<{
          url: string;
          text: string;
          fileName: string;
        }>;
      }
    }

    if (!materials || !Array.isArray(materials) || materials.length === 0) {
      return {
        relevantMaterialsText: "",
        topSimilarity: null,
        resultsCount: 0,
        method: "none",
      };
    }

    const keywordContext = searchRelevantMaterials(materials, message, 3, 2000);
    const cleaned = cleanContext(keywordContext);
    console.log("📝 [chat] 키워드 검색 결과:", {
      found: cleaned.length > 0,
      length: cleaned.length,
    });
    return {
      relevantMaterialsText: cleaned,
      topSimilarity: null,
      resultsCount: cleaned.length > 0 ? 1 : 0,
      method: "keyword",
    };
  } catch (error) {
    console.error("❌ [chat] RAG 검색 실패:", error);
    console.error("상세 에러:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      relevantMaterialsText: "",
      topSimilarity: null,
      resultsCount: 0,
      method: "none",
    };
  }
}

// 공통 Completion 함수 - Responses API 사용 (previous_response_id 방식)
async function getAIResponse(
  systemPrompt: string,
  userMessage: string,
  previousResponseId: string | null = null
): Promise<{ response: string; responseId: string; tokensUsed?: number }> {
  const aiStartTime = Date.now();
  try {
    if (process.env.NODE_ENV === "development") {
      console.log(
        "Calling OpenAI Responses API with prompt length:",
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
      store: true, // 응답을 저장하여 나중에 참조 가능하도록
    });

    const aiDuration = Date.now() - aiStartTime;
    console.log(
      `⏱️  [PERFORMANCE] OpenAI Responses API response time: ${aiDuration}ms`
    );

    if (process.env.NODE_ENV === "development") {
      console.log("OpenAI Responses API response received:", {
        responseId: response.id,
        hasOutput: !!response.output,
        outputLength: response.output?.length || 0,
      });
    }

    // output 배열에서 메시지 타입 찾기
    let responseText = "";
    const outputArray = response.output as any;
    if (outputArray && Array.isArray(outputArray)) {
      // type이 'message'인 항목 찾기
      const messageOutput = outputArray.find(
        (item: any) => item.type === "message" && item.content
      );

      if (messageOutput && Array.isArray(messageOutput.content)) {
        // content 배열에서 텍스트 추출
        const textParts = messageOutput.content
          .filter((part: any) => part.type === "output_text" && part.text)
          .map((part: any) => part.text);
        responseText = textParts.join("");
      }
    }

    if (!responseText || responseText.trim().length === 0) {
      console.warn("OpenAI returned empty or null response");
      return {
        response:
          "I'm sorry, I couldn't process your question. Please try rephrasing it.",
        responseId: response.id,
      };
    }

    // Responses API는 토큰 사용량을 직접 반환하지 않으므로 null 반환
    // 필요시 response_id로 나중에 조회 가능
    return {
      response: responseText,
      responseId: response.id,
      tokensUsed: undefined, // Responses API는 usage 정보를 제공하지 않음
    };
  } catch (openaiError) {
    console.error("OpenAI Responses API error:", openaiError);
    throw new Error(
      `OpenAI Responses API failed: ${(openaiError as Error).message}`
    );
  }
}

async function fetchPreviousResponseId(params: {
  sessionId: string;
  qIdx: number;
}): Promise<string | null> {
  const { sessionId, qIdx } = params;
  const { data, error } = await supabase
    .from("messages")
    .select("response_id")
    .eq("session_id", sessionId)
    .eq("q_idx", qIdx)
    .eq("role", "ai")
    .not("response_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching previous response_id:", error);
  }

  return data?.response_id || null;
}

async function incrementUsedClarifications(params: {
  sessionId: string;
  fallbackValue?: number;
  skip?: boolean;
}): Promise<void> {
  const { sessionId, fallbackValue, skip } = params;
  if (skip) return;

  // 가능하면 RPC로 원자적 증가(경쟁 상태 방지). 없으면 기존 update로 폴백.
  try {
    const { error } = await supabase.rpc("increment_used_clarifications", {
      p_session_id: sessionId,
      p_amount: 1,
    });
    if (!error) return;

    // function 미존재 등은 폴백
    console.warn("[chat] increment_used_clarifications rpc failed, fallback", {
      code: (error as any)?.code,
      message: (error as any)?.message,
    });
  } catch (e) {
    console.warn("[chat] increment_used_clarifications rpc threw, fallback", e);
  }

  // 폴백: 현재 값 기반 단일 update (동시성 완전 보장은 아니지만 왕복 최소화)
  await supabase
    .from("sessions")
    .update({ used_clarifications: (fallbackValue ?? 0) + 1 })
    .eq("id", sessionId);
}

function buildSystemPrompt(params: {
  examTitle?: string;
  examCode?: string;
  questionId?: string;
  currentQuestionText?: string;
  currentQuestionAiContext?: string;
  relevantMaterialsText?: string;
  rubric?: RubricItem[];
}): string {
  const {
    examTitle,
    examCode,
    questionId,
    currentQuestionText,
    currentQuestionAiContext,
    relevantMaterialsText,
    rubric,
  } = params;

  const materialsInstruction = buildMaterialsPriorityInstruction();
  const hasRubric = !!(rubric && Array.isArray(rubric) && rubric.length > 0);

  if (hasRubric) {
    return `
${
  examTitle
    ? `학생이 시험: ${examTitle} (코드: ${
        examCode || "N/A"
      })를 치르고 있습니다.`
    : "학생이 시험 중입니다."
}
${questionId ? `현재 문제 ID: ${questionId}에 있습니다.` : ""}
${currentQuestionText ? `문제 내용: ${currentQuestionText}` : ""}
${currentQuestionAiContext ? `문제 컨텍스트: ${currentQuestionAiContext}` : ""}
${relevantMaterialsText ? relevantMaterialsText : ""}

${materialsInstruction}

**평가 루브릭:**
${(rubric || [])
  .map(
    (item, index) =>
      `${index + 1}. ${item.evaluationArea}
   - 세부 기준: ${item.detailedCriteria}`
  )
  .join("\n")}

역할(Role):
- 너는 특정한 가상의 상황을 가정하고 문제를 출제했다. 학생이 묻는 질문에는 반드시 너가 가정한 '특정한 가상의 상황'에 기반해서 답해줘
- 너는 대학 강의의 교수자(Professor) 역할이다.     
- 답변은 실제 교수-학생의 질의응답처럼 진행한다. 

규칙(Rules):
- 너는 특정한 가상의 상황을 가정하고 문제를 출제했다. 학생이 묻는 질문에는 반드시 너가 가정한 '특정한 가상의 상황'에 기반해서 답해줘
- 임계값이 0.2 미만 or 자료에서 답을 못찾았을 경우 or 임계값 0.2 이하이고 자료에서 답을 못찾았을 경우 다음과 같은 프롬프트만 적용한다 or 자료가 아예 존재하지 않을 경우 '
      역할(Role):
      - 너는 특정한 가상의 상황을 가정하고 문제를 출제했다. 학생이 묻는 질문에는 반드시 너가 가정한 '특정한 가상의 상황'에 기반해서 답해줘
      - 너는 대학 강의의 교수자(Professor) 역할이다.     
      - 답변은 실제 교수-학생의 질의응답처럼 진행한다. 

      규칙(Rules):
      - 너는 항상 **마크다운** 형식으로 대답한다.
      - ~ㅂ니다 라는 말을 사용한다.
      - 학생이 정보를 묻는 질문에는 오직 사실 정보만 응답한다.
      - 정보를 묻는 질문에는 반드시 문장은 최대 한 문장으로 제한한다.
      - 생성형 요청 질문에는 성실하게 답변한다.
      - 설명, 맥락, 해설, 코멘트, 판단은 절대 금지.
      - 질문에 직접 대응되지 않는 정보는 제공하지 않는다.
  '
- 너는 항상 **마크다운** 형식으로 대답한다.
- ~ㅂ니다 라는 말을 사용한다.
- 학생이 정보를 묻는 질문에는 오직 사실 정보만 응답한다.
- 정보를 묻는 질문에는 반드시 문장은 최대 한 문장으로 제한한다.
- 생성형 요청 질문에는 성실하게 답변한다.
- 설명, 맥락, 해설, 코멘트, 판단은 절대 금지.
- 질문에 직접 대응되지 않는 정보는 제공하지 않는다.
`.trim();
  }

  // temp / rubric 없는 경우 (기존 tempSystemPrompt 스타일 유지)
  // 조준형의 주석: 임계치가 낮을 경우도 하는게 좋을듯?
  return `
${
  examTitle
    ? `학생이 시험: ${examTitle} (코드: ${
        examCode || "N/A"
      })를 치르고 있습니다.`
    : "학생이 시험 중입니다."
}
${questionId ? `현재 문제 ID: ${questionId}에 있습니다.` : ""}
${currentQuestionText ? `문제 내용: ${currentQuestionText}` : ""}
${currentQuestionAiContext ? `문제 컨텍스트: ${currentQuestionAiContext}` : ""}
${relevantMaterialsText ? relevantMaterialsText : ""}

${materialsInstruction}

역할(Role):
- 너는 특정한 가상의 상황을 가정하고 문제를 출제했다. 학생이 묻는 질문에는 반드시 너가 가정한 '특정한 가상의 상황'에 기반해서 답해줘
- 너는 대학 강의의 교수자(Professor) 역할이다.     
- 답변은 실제 교수-학생의 질의응답처럼 진행한다. 

규칙(Rules):
- 너는 항상 **마크다운** 형식으로 대답한다.
- ~ㅂ니다 라는 말을 사용한다.
- 학생이 정보를 묻는 질문에는 오직 사실 정보만 응답한다.
- 정보를 묻는 질문에는 반드시 문장은 최대 한 문장으로 제한한다.
- 생성형 요청 질문에는 성실하게 답변한다.
- 설명, 맥락, 해설, 코멘트, 판단은 절대 금지.
- 질문에 직접 대응되지 않는 정보는 제공하지 않는다.
`.trim();
}

async function resolveTempSession(params: {
  sessionId: string;
  examId?: string;
  studentId?: string;
}): Promise<{
  actualSessionId: string;
  usedClarifications?: number;
  skipIncrementUsedClarifications: boolean;
}> {
  const { sessionId, examId, studentId } = params;
  let actualSessionId = sessionId;
  let usedClarifications: number | undefined;
  let skipIncrementUsedClarifications = false;

  if (!examId || !studentId) {
    return {
      actualSessionId,
      usedClarifications,
      skipIncrementUsedClarifications,
    };
  }

  const { data: existingSession } = await supabase
    .from("sessions")
    .select("id, used_clarifications")
    .eq("exam_id", examId)
    .eq("student_id", studentId)
    .single();

  if (existingSession) {
    actualSessionId = existingSession.id;
    usedClarifications = existingSession.used_clarifications ?? 0;
    return {
      actualSessionId,
      usedClarifications,
      skipIncrementUsedClarifications,
    };
  }

  // 새 세션은 첫 대화에서 used_clarifications가 1이 되도록 바로 세팅 (추가 update 왕복 제거)
  const { data: newSession } = await supabase
    .from("sessions")
    .insert([
      { exam_id: examId, student_id: studentId, used_clarifications: 1 },
    ])
    .select("id, used_clarifications")
    .single();

  if (newSession) {
    actualSessionId = newSession.id;
    usedClarifications = newSession.used_clarifications ?? 1;
    skipIncrementUsedClarifications = true;
  }

  return {
    actualSessionId,
    usedClarifications,
    skipIncrementUsedClarifications,
  };
}

async function handleChatLogic(params: {
  sessionId: string;
  message: string;
  qIdx: number;
  questionId?: string;
  examTitle?: string;
  examCode: string;
  examId?: string;
  examMaterialsText?: Array<{ url: string; text: string; fileName: string }>;
  rubric?: RubricItem[];
  currentQuestionText?: string;
  currentQuestionAiContext?: string;
  usedClarificationsFallback?: number;
  skipIncrementUsedClarifications?: boolean;
}): Promise<{
  aiResponse: string;
  responseId: string;
  topSimilarity: number | null;
}> {
  const {
    sessionId,
    message,
    qIdx,
    questionId,
    examTitle,
    examCode,
    examId,
    examMaterialsText,
    rubric,
    currentQuestionText,
    currentQuestionAiContext,
    usedClarificationsFallback,
    skipIncrementUsedClarifications,
  } = params;

  const messageTypePromise = classifyMessageType(message).catch(
    () => "other" as MessageType
  );
  const ragPromise = getRagContext({ message, examId, examMaterialsText });
  const previousResponsePromise = fetchPreviousResponseId({ sessionId, qIdx });

  // 사용자 메시지 저장은 message_type / rag topSimilarity를 포함 (대기 최소화를 위해 병렬로 진행)
  const insertUserPromise = (async () => {
    const [messageType, rag] = await Promise.all([
      messageTypePromise,
      ragPromise,
    ]);
    const { error } = await supabase.from("messages").insert([
      {
        session_id: sessionId,
        q_idx: qIdx,
        role: "user",
        content: message,
        message_type: messageType,
        metadata: {
          rag: {
            topSimilarity: rag.topSimilarity,
            resultsCount: rag.resultsCount,
            method: rag.method,
          },
        },
      },
    ]);
    if (error) console.error("Error saving user message:", error);
  })();

  // 세 작업은 동시에 시작되며, 응답 반환 전에는 반드시 모두 완료되도록 await
  const rag = await ragPromise;
  const previousResponseId = await previousResponsePromise;
  await insertUserPromise;

  if (process.env.NODE_ENV === "development") {
    console.log(
      "📜 Previous response_id:",
      previousResponseId || "none (first message)"
    );
  }

  const systemPrompt = buildSystemPrompt({
    examTitle,
    examCode,
    questionId,
    currentQuestionText,
    currentQuestionAiContext,
    relevantMaterialsText: rag.relevantMaterialsText,
    rubric,
  });

  const { response: aiResponse, responseId } = await getAIResponse(
    systemPrompt,
    message,
    previousResponseId
  );

  // AI 응답/세션 업데이트는 반드시 응답 전에 await (fetch failed 방지)
  const insertAiPromise = supabase.from("messages").insert([
    {
      session_id: sessionId,
      q_idx: qIdx,
      role: "ai",
      content: aiResponse,
      response_id: responseId,
      tokens_used: null,
      metadata: {
        rag: {
          topSimilarity: rag.topSimilarity,
          resultsCount: rag.resultsCount,
          method: rag.method,
        },
      },
    },
  ]);

  const incrementPromise = incrementUsedClarifications({
    sessionId,
    fallbackValue: usedClarificationsFallback,
    skip: !!skipIncrementUsedClarifications,
  });

  const [aiInsertResult] = await Promise.all([
    insertAiPromise,
    incrementPromise,
  ]);
  if (aiInsertResult.error)
    console.error("Error saving AI message:", aiInsertResult.error);

  return { aiResponse, responseId, topSimilarity: rag.topSimilarity };
}

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  try {
    console.log("[chat] incoming request", {
      method: request.method,
      path: request.nextUrl?.pathname,
      contentType: request.headers.get("content-type"),
      origin: request.headers.get("origin"),
      referer: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent")?.slice(0, 80),
    });

    const body = (await request.json()) as ChatRequestBody;

    // 📊 사용자 활동 로그
    console.log(
      `👤 [USER_ACTIVITY] Student ${body.studentId || "unknown"} | Session ${
        body.sessionId
      } | Question ${body.questionIdx || body.questionId} | Exam ${
        body.examCode || body.examId
      }`
    );

    const {
      message,
      sessionId,
      questionId,
      questionIdx, // Preferred: use question index
      examTitle: requestExamTitle,
      examCode: requestExamCode,
      examId,
      studentId,
      currentQuestionText,
      currentQuestionAiContext,
    } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Missing message field" },
        { status: 400 }
      );
    }

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    // 안전한 문제 인덱스 계산 (공통 로직)
    let safeQIdx: number;
    if (questionIdx !== undefined && questionIdx !== null) {
      const parsed = parseInt(String(questionIdx), 10);
      safeQIdx = Number.isFinite(parsed) ? parsed : 0;
    } else if (questionId) {
      const parsed = parseInt(String(questionId), 10);
      safeQIdx = Number.isFinite(parsed) ? Math.abs(parsed % 2147483647) : 0;
    } else {
      safeQIdx = 0;
    }

    const isTemp = sessionId.startsWith("temp_");

    // ✅ 임시/정규 공통 처리: 세션/시험 컨텍스트만 준비하고 나머지는 handleChatLogic로 통합
    if (isTemp) {
      const {
        actualSessionId,
        usedClarifications,
        skipIncrementUsedClarifications,
      } = await resolveTempSession({ sessionId, examId, studentId });

      // temp_로 남아있는 경우(DB 적재 불가): AI 응답은 하되 DB 저장은 생략
      if (!actualSessionId || actualSessionId.startsWith("temp_")) {
        const rag = await getRagContext({ message, examId });
        const prompt = buildSystemPrompt({
          examTitle: requestExamTitle,
          examCode: requestExamCode || "TEMP",
          questionId,
          currentQuestionText,
          currentQuestionAiContext,
          relevantMaterialsText: rag.relevantMaterialsText,
        });

        const previousResponseId = null;
        const { response: aiResponse } = await getAIResponse(
          prompt,
          message,
          previousResponseId
        );

        return NextResponse.json({
          response: aiResponse,
          timestamp: new Date().toISOString(),
          examCode: requestExamCode || "TEMP",
          questionId: questionId || "temp",
        });
      }

      const { aiResponse } = await handleChatLogic({
        sessionId: actualSessionId,
        message,
        qIdx: safeQIdx,
        questionId,
        examTitle: requestExamTitle,
        examCode: requestExamCode || "TEMP",
        examId,
        currentQuestionText,
        currentQuestionAiContext,
        usedClarificationsFallback: usedClarifications,
        skipIncrementUsedClarifications,
      });

      return NextResponse.json({
        response: aiResponse,
        timestamp: new Date().toISOString(),
        examCode: requestExamCode || "TEMP",
        questionId: questionId || "temp",
      });
    }

    // ✅ 정규 세션 처리 (컨텍스트 조회)
    console.log(
      "🔍 DEBUG: Entering REGULAR session processing for sessionId:",
      sessionId
    );

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id, used_clarifications")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      console.error(
        "Error fetching session:",
        sessionError,
        "SessionId:",
        sessionId
      );
      return NextResponse.json(
        { error: "Invalid session", details: sessionError?.message },
        { status: 400 }
      );
    }

    if (!session.exam_id) {
      console.error("Session has no exam_id:", session);
      return NextResponse.json(
        { error: "Session is missing exam information" },
        { status: 400 }
      );
    }

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      console.error(
        "Error fetching exam:",
        examError,
        "ExamId:",
        session.exam_id
      );
      return NextResponse.json(
        { error: "Exam not found", details: examError?.message },
        { status: 404 }
      );
    }

    const effectiveExamId = examId || exam.id;
    const rubric = Array.isArray(exam.rubric)
      ? (exam.rubric as RubricItem[])
      : undefined;
    const materialsText = Array.isArray(exam.materials_text)
      ? (exam.materials_text as Array<{
          url: string;
          text: string;
          fileName: string;
        }>)
      : undefined;

    const { aiResponse } = await handleChatLogic({
      sessionId,
      message,
      qIdx: safeQIdx,
      questionId,
      examTitle: requestExamTitle,
      examCode: exam.code,
      examId: effectiveExamId,
      examMaterialsText: materialsText,
      rubric,
      currentQuestionText,
      currentQuestionAiContext,
      usedClarificationsFallback: session.used_clarifications ?? 0,
    });

    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Total request time (regular): ${requestDuration}ms`
    );

    return NextResponse.json({
      response: aiResponse,
      timestamp: new Date().toISOString(),
      examCode: exam.code,
      questionId,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("Chat API error details:", {
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
