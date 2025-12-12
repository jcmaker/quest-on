import { NextRequest, NextResponse } from "next/server";
import { openai, AI_MODEL } from "@/lib/openai";
import { createClient } from "@supabase/supabase-js";
import { searchRelevantMaterials } from "@/lib/material-search";

// Supabase 서버 전용 클라이언트 (절대 클라이언트에 노출 금지)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, // 서버 전용 env 사용 (NEXT_PUBLIC은 브라우저에서도 접근 가능하지만 서버에서는 안전하게 사용)
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 메시지 타입 분류 함수 (개념/계산/전략/기타)
async function classifyMessageType(
  message: string
): Promise<"concept" | "calculation" | "strategy" | "other"> {
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

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  try {
    const body = await request.json();

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
      requestCoreAbility: requestCoreAbility,
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
      safeQIdx = parseInt(String(questionIdx));
    } else if (questionId) {
      safeQIdx = Math.abs(parseInt(questionId) % 2147483647);
    } else {
      safeQIdx = 0;
    }

    // ✅ 임시 세션 처리
    if (sessionId.startsWith("temp_")) {
      // 임시 세션 처리 로직은 기존과 동일하게 유지 (복잡성 때문에 이번 최적화에서는 제외하되 구조만 정리)
      // ... (기존 로직 유지)
      // 실제 세션 ID 확인 및 생성
      let actualSessionId = sessionId;
      if (examId && studentId) {
        const { data: existingSession } = await supabase
          .from("sessions")
          .select("id")
          .eq("exam_id", examId)
          .eq("student_id", studentId)
          .single();

        if (existingSession) {
          actualSessionId = existingSession.id;
        } else {
          const { data: newSession } = await supabase
            .from("sessions")
            .insert([{ exam_id: examId, student_id: studentId }])
            .select()
            .single();
          if (newSession) actualSessionId = newSession.id;
        }
      }

      // 수업 자료에서 관련 내용 검색
      let relevantMaterialsText = "";
      if (examId) {
        try {
          console.log("[chat] 임시 세션 - 수업 자료 검색 시작:", { examId });
          const { data: examData, error: examDataError } = await supabase
            .from("exams")
            .select("materials_text")
            .eq("id", examId)
            .single();

          if (examDataError) {
            console.error("[chat] 임시 세션 - exam 조회 실패:", examDataError);
          }

          if (
            examData?.materials_text &&
            Array.isArray(examData.materials_text)
          ) {
            const materialsText = examData.materials_text as Array<{
              url: string;
              text: string;
              fileName: string;
            }>;
            console.log("[chat] 임시 세션 - materials_text 발견:", {
              count: materialsText.length,
              totalTextLength: materialsText.reduce(
                (sum, m) => sum + (m.text?.length || 0),
                0
              ),
            });
            relevantMaterialsText = searchRelevantMaterials(
              materialsText,
              message,
              3, // 최대 3개 결과
              2000 // 최대 2000자
            );
            console.log("[chat] 임시 세션 - 검색 결과:", {
              found: relevantMaterialsText.length > 0,
              resultLength: relevantMaterialsText.length,
              preview: relevantMaterialsText.substring(0, 200),
            });
          } else {
            console.log(
              "[chat] 임시 세션 - materials_text 없음 또는 배열 아님:",
              {
                hasMaterialsText: !!examData?.materials_text,
                isArray: Array.isArray(examData?.materials_text),
              }
            );
          }
        } catch (error) {
          console.error("[chat] 임시 세션 - 수업 자료 검색 실패:", error);
          // 에러가 발생해도 계속 진행
        }
      } else {
        console.log("[chat] 임시 세션 - examId 없음, 검색 건너뜀");
      }

      // Prompt 생성
      const tempSystemPrompt = `
${
  requestExamTitle
    ? `학생이 시험: ${requestExamTitle} (코드: ${
        requestExamCode || "N/A"
      })를 치르고 있습니다.`
    : "학생이 시험 중입니다."
}
${questionId ? `현재 문제 ID: ${questionId}에 있습니다.` : ""}
${currentQuestionText ? `문제 내용: ${currentQuestionText}` : ""}
${requestCoreAbility ? `문제 핵심 역량: ${requestCoreAbility}` : ""}
${relevantMaterialsText ? relevantMaterialsText : ""}

**중요**: 위의 [수업 자료 참고 내용]이 제공된 경우, 반드시 그 내용을 기반으로 답변해야 합니다. 수업 자료의 내용을 참고하여 정확하고 구체적인 답변을 제공하세요.

역할(Role):
- 너는 특정한 가상의 상황을 가정하고 문제를 출제했다. 
학생이 묻는 질문에는 반드시 너가 가정한 '특정한 가상의 상황'에 기반해서 답해줘
- 너는 대학 강의의 교수자(Professor) 역할이다.  
- 나는 해당 수업의 학생(Student)으로서 개방형 문제를 해결하기 위해 질문한다.  
- 너는 나의 사고를 확장시키기 위해 **가상의 상황, 수치, 사례, 데이터**를 자유롭게 설정해 대화한다.  
- 이때 제시되는 모든 수치는 실제가 아닌 **학습용 시뮬레이션 예시**로 간주되며, 이를 따로 언급하지 않는다.  
- 답변은 실제 교수-학생의 질의응답처럼 구체적이고 사고를 자극하는 방향으로 구성한다.  
- ~ㅂ니다 라는 말을 사용한다.

규칙(Rules):
1. 대신 **가정, 수치, 표, 구조적 프레임**을 통해 학생이 추론하도록 돕는다.  
2. “가상의 예시임”, “실제 데이터를 바탕으로 해야 한다” 등의 문장은 절대 사용하지 않는다.  
   (그 정보는 시스템적으로 이미 인지된 것으로 간주한다.)  
3. 답변은 묻는 말에만 간결하게 답한다. 
4. 학생 질문이 모호할 경우, **비교 기준·분석 단위·시간축** 등을 되물어 명확히 한다.  
5. 가능한 경우 **간단한 표, 지표, 비교 수치**를 포함해 사고의 틀을 제시한다.  
6. 평가 루브릭의 핵심 역량(논리적 근거, 자료 분석, 의사결정 근거)을 반영한다.
`;

      // 병렬 처리: 메시지 저장과 이전 response_id 조회를 동시에 실행
      let previousResponseId: string | null = null;

      if (actualSessionId && !actualSessionId.startsWith("temp_")) {
        const insertPromise = supabase.from("messages").insert([
          {
            session_id: actualSessionId,
            q_idx: safeQIdx,
            role: "user",
            content: message,
          },
        ]);

        // 가장 최근 AI 응답의 response_id 조회 (previous_response_id로 사용)
        const fetchPreviousResponseIdPromise = supabase
          .from("messages")
          .select("response_id")
          .eq("session_id", actualSessionId)
          .eq("q_idx", safeQIdx)
          .eq("role", "ai")
          .not("response_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        // 병렬 실행 대기
        const [insertResult, previousResponseResult] = await Promise.all([
          insertPromise,
          fetchPreviousResponseIdPromise,
        ]);

        if (insertResult.error)
          console.error(
            "Error saving temp session user message:",
            insertResult.error
          );

        if (
          previousResponseResult.error &&
          previousResponseResult.error.code !== "PGRST116"
        ) {
          // PGRST116은 "no rows returned" 에러로, 첫 메시지인 경우 정상임
          console.error(
            "Error fetching previous response_id:",
            previousResponseResult.error
          );
        }

        // 이전 response_id 추출 (없으면 null = 첫 메시지)
        previousResponseId = previousResponseResult.data?.response_id || null;
      }

      const { response: aiResponse, responseId } = await getAIResponse(
        tempSystemPrompt,
        message,
        previousResponseId
      );

      // AI 응답 저장 및 세션 업데이트 (병렬 처리)
      if (
        actualSessionId &&
        !actualSessionId.startsWith("temp_") &&
        aiResponse
      ) {
        // 1. AI 메시지 저장 (response_id 포함)
        const saveAiMsgPromise = supabase.from("messages").insert([
          {
            session_id: actualSessionId,
            q_idx: safeQIdx,
            role: "ai",
            content: aiResponse,
            response_id: responseId, // OpenAI Responses API의 response ID 저장
          },
        ]);

        // 2. 세션 카운트 업데이트 (SQL increment 사용 권장되지만 여기선 읽고 쓰기 방식 유지하되 독립적으로 실행)
        // rpc를 사용하면 더 좋지만 현재 구조 유지
        const updateSessionPromise = (async () => {
          const { data: currentSession } = await supabase
            .from("sessions")
            .select("used_clarifications")
            .eq("id", actualSessionId)
            .single();

          if (currentSession) {
            await supabase
              .from("sessions")
              .update({
                used_clarifications:
                  (currentSession.used_clarifications || 0) + 1,
              })
              .eq("id", actualSessionId);
          }
        })();

        // 완료 기다리지 않고 로그만 찍거나 필요하면 await
        Promise.all([saveAiMsgPromise, updateSessionPromise]).catch((err) =>
          console.error("Error saving temp session AI data:", err)
        );
      }

      return NextResponse.json({
        response: aiResponse,
        timestamp: new Date().toISOString(),
        examCode: requestExamCode || "TEMP",
        questionId: questionId || "temp",
      });
    }

    // ✅ 정규 세션 처리 (최적화 적용)
    console.log(
      "🔍 DEBUG: Entering REGULAR session processing for sessionId:",
      sessionId
    );

    // 1. 세션 조회 (Join 없이)
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
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

    // 2. 시험 정보 조회 (별도 쿼리)
    // session.exam_id가 존재하는지 확인
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

    // 현재 문제의 핵심 역량 찾기
    let dbCoreAbility = "";
    if (questionId && exam?.questions) {
      const questionIndex = parseInt(questionId);

      // Define a minimal type for the question object
      interface QuestionType {
        id: string;
        core_ability?: string;
        [key: string]: unknown;
      }

      const questions = exam.questions as unknown as QuestionType[];

      // Check if questions is an array and index is valid
      if (
        Array.isArray(questions) &&
        !isNaN(questionIndex) &&
        questions[questionIndex]
      ) {
        const q = questions[questionIndex];
        dbCoreAbility = q.core_ability || "";
      } else if (Array.isArray(questions)) {
        // Fallback: try to find by ID if questionId is a string ID not index
        const q = questions.find((q) => q.id === questionId);
        if (q) {
          dbCoreAbility = q.core_ability || "";
        }
      }
    }

    // 수업 자료에서 관련 내용 검색
    let relevantMaterialsText = "";
    if (exam?.materials_text && Array.isArray(exam.materials_text)) {
      try {
        const materialsText = exam.materials_text as Array<{
          url: string;
          text: string;
          fileName: string;
        }>;
        console.log("[chat] 정규 세션 - 수업 자료 검색 시작:", {
          materialsCount: materialsText.length,
          totalTextLength: materialsText.reduce(
            (sum, m) => sum + (m.text?.length || 0),
            0
          ),
          question: message.substring(0, 100),
        });
        relevantMaterialsText = searchRelevantMaterials(
          materialsText,
          message,
          3, // 최대 3개 결과
          2000 // 최대 2000자
        );
        console.log("[chat] 정규 세션 - 검색 결과:", {
          found: relevantMaterialsText.length > 0,
          resultLength: relevantMaterialsText.length,
          preview: relevantMaterialsText.substring(0, 300),
        });
      } catch (error) {
        console.error("[chat] 정규 세션 - 수업 자료 검색 실패:", error);
        // 에러가 발생해도 계속 진행
      }
    } else {
      console.log("[chat] 정규 세션 - materials_text 없음:", {
        hasExam: !!exam,
        hasMaterialsText: !!exam?.materials_text,
        isArray: Array.isArray(exam?.materials_text),
      });
    }

    const systemPrompt = `
${
  requestExamTitle
    ? `학생이 시험: ${requestExamTitle} (코드: ${
        requestExamCode || "N/A"
      })를 치르고 있습니다.`
    : "학생이 시험 중입니다."
}
${questionId ? `현재 문제 ID: ${questionId}에 있습니다.` : ""}
${currentQuestionText ? `문제 내용: ${currentQuestionText}` : ""}
${
  requestCoreAbility
    ? `문제 핵심 역량: ${requestCoreAbility}`
    : dbCoreAbility
    ? `문제 핵심 역량: ${dbCoreAbility}`
    : ""
}
${relevantMaterialsText ? relevantMaterialsText : ""}

${
  exam?.rubric && Array.isArray(exam.rubric) && exam.rubric.length > 0
    ? `
**평가 루브릭:**
${exam.rubric
  .map(
    (
      item: {
        evaluationArea: string;
        detailedCriteria: string;
      },
      index: number
    ) =>
      `${index + 1}. ${item.evaluationArea}
   - 세부 기준: ${item.detailedCriteria}`
  )
  .join("\n")}

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
`
    : ""
}
`;

    // 2. 메시지 타입 분류 (비동기로 실행, 실패해도 계속 진행)
    const messageTypePromise = classifyMessageType(message).catch(
      () => "other"
    );

    // 3. 병렬 처리: 사용자 메시지 DB 저장 & 이전 response_id 조회
    const insertUserMsgPromise = supabase.from("messages").insert([
      {
        session_id: sessionId,
        q_idx: safeQIdx,
        role: "user",
        content: message,
        message_type: await messageTypePromise, // 메시지 타입 저장
      },
    ]);

    // 가장 최근 AI 응답의 response_id 조회 (previous_response_id로 사용)
    const fetchPreviousResponseIdPromise = supabase
      .from("messages")
      .select("response_id")
      .eq("session_id", sessionId)
      .eq("q_idx", safeQIdx)
      .eq("role", "ai")
      .not("response_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Wait for both
    const [userMsgResult, previousResponseResult] = await Promise.all([
      insertUserMsgPromise,
      fetchPreviousResponseIdPromise,
    ]);

    if (userMsgResult.error) {
      console.error("Error saving user message:", userMsgResult.error);
    }
    if (
      previousResponseResult.error &&
      previousResponseResult.error.code !== "PGRST116"
    ) {
      // PGRST116은 "no rows returned" 에러로, 첫 메시지인 경우 정상임
      console.error(
        "Error fetching previous response_id:",
        previousResponseResult.error
      );
    }

    // 이전 response_id 추출 (없으면 null = 첫 메시지)
    const previousResponseId: string | null =
      previousResponseResult.data?.response_id || null;

    if (process.env.NODE_ENV === "development") {
      console.log(
        "📜 Previous response_id:",
        previousResponseId || "none (first message)"
      );
    }

    // 4. OpenAI Responses API 호출
    const {
      response: aiResponse,
      responseId,
      tokensUsed,
    } = await getAIResponse(systemPrompt, message, previousResponseId);

    if (
      !aiResponse ||
      typeof aiResponse !== "string" ||
      aiResponse.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Failed to generate AI response" },
        { status: 500 }
      );
    }

    // 5. 병렬 처리: AI 응답 DB 저장 (response_id, 토큰 사용량 포함) & 세션 업데이트
    const insertAiMsgPromise = supabase.from("messages").insert([
      {
        session_id: sessionId,
        q_idx: safeQIdx,
        role: "ai",
        content: aiResponse,
        response_id: responseId, // OpenAI Responses API의 response ID 저장
        tokens_used: tokensUsed || null, // 토큰 사용량 (Responses API는 제공하지 않음)
        metadata: tokensUsed
          ? { prompt_tokens: 0, completion_tokens: 0, total_tokens: tokensUsed }
          : {}, // 메타데이터에 토큰 정보 저장
      },
    ]);

    const updateSessionPromise = supabase
      .from("sessions")
      .update({
        used_clarifications: (session.used_clarifications ?? 0) + 1,
      })
      .eq("id", sessionId);

    // 비동기로 처리하되 에러 로깅을 위해 catch 부착
    Promise.all([insertAiMsgPromise, updateSessionPromise]).then(
      ([aiResult, sessionResult]) => {
        if (aiResult.error)
          console.error("Error saving AI message:", aiResult.error);
        if (sessionResult.error)
          console.error("Error updating session:", sessionResult.error);
      }
    );

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
    return NextResponse.json(
      {
        error: "Internal server error",
        details: (error as Error)?.message,
      },
      { status: 500 }
    );
  }
}
