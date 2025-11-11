import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Supabase 서버 전용 클라이언트 (절대 클라이언트에 노출 금지)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, // 서버 전용 env 사용 (NEXT_PUBLIC은 브라우저에서도 접근 가능하지만 서버에서는 안전하게 사용)
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 공통 Completion 함수
async function getAIResponse(
  systemPrompt: string,
  userMessage: string,
  temperature = 0.7,
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }> = []
) {
  const aiStartTime = Date.now();
  try {
    if (process.env.NODE_ENV === "development") {
      console.log(
        "Calling OpenAI API with prompt length:",
        systemPrompt.length,
        "| Conversation history messages:",
        conversationHistory.length
      );
    }

    // messages 배열 구성: system message + conversation history + current user message
    const messages: Array<
      | { role: "system"; content: string }
      | { role: "user" | "assistant"; content: string }
    > = [{ role: "system", content: systemPrompt }];

    // 이전 대화 이력 추가
    conversationHistory.forEach((msg) => {
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    });

    // 현재 사용자 메시지 추가
    messages.push({ role: "user", content: userMessage });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 300,
      temperature,
    });

    const aiDuration = Date.now() - aiStartTime;
    console.log(`⏱️  [PERFORMANCE] OpenAI API response time: ${aiDuration}ms`);

    if (process.env.NODE_ENV === "development") {
      console.log("OpenAI response received:", {
        choicesCount: completion.choices?.length,
        hasContent: !!completion.choices?.[0]?.message?.content,
      });
    }

    const response = completion.choices[0]?.message?.content;

    if (!response || response.trim().length === 0) {
      console.warn("OpenAI returned empty or null response");
      return "I'm sorry, I couldn't process your question. Please try rephrasing it.";
    }

    return response;
  } catch (openaiError) {
    console.error("OpenAI API error:", openaiError);
    throw new Error(`OpenAI API failed: ${(openaiError as Error).message}`);
  }
}

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  try {
    const body = await request.json();
    console.log("Chat API received request:", body);
    console.log(
      "🔍 DEBUG: sessionId =",
      body.sessionId,
      "| startsWith temp_ =",
      body.sessionId?.startsWith("temp_")
    );

    // 📊 사용자 활동 로그
    console.log(
      `👤 [USER_ACTIVITY] Student ${body.studentId || "unknown"} | Session ${
        body.sessionId
      } | Question ${body.questionIdx || body.questionId} | Exam ${
        body.examCode || body.examId
      }`
    );

    // 🧪 DB 연결 테스트
    try {
      const { data: testData, error: testError } = await supabase
        .from("sessions")
        .select("id")
        .limit(1);
      console.log(
        "✅ DB 연결 테스트:",
        testError ? "실패" : "성공",
        testError || `(${testData?.length || 0}개 레코드 조회)`
      );
    } catch (dbTestError) {
      console.error("❌ DB 연결 테스트 실패:", dbTestError);
    }

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
      if (process.env.NODE_ENV === "development") {
        console.log("Missing sessionId:", sessionId);
      }
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    // ✅ 임시 세션 처리 - DB 저장도 함께 수행
    if (sessionId.startsWith("temp_")) {
      if (process.env.NODE_ENV === "development") {
        console.log("Processing temporary session:", sessionId);
      }

      // 임시 세션이라도 실제 세션을 찾거나 생성
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
          if (process.env.NODE_ENV === "development") {
            console.log("Found existing session:", actualSessionId);
          }
        } else {
          // Create new session
          const { data: newSession, error: createError } = await supabase
            .from("sessions")
            .insert([
              {
                exam_id: examId,
                student_id: studentId,
              },
            ])
            .select()
            .single();

          if (!createError && newSession) {
            actualSessionId = newSession.id;
            if (process.env.NODE_ENV === "development") {
              console.log("Created new session:", actualSessionId);
            }
          } else {
            console.error("Error creating session:", createError);
          }
        }
      }

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

      // 사용자 메시지 DB 저장 (임시 세션도 저장)
      if (actualSessionId && !actualSessionId.startsWith("temp_")) {
        if (process.env.NODE_ENV === "development") {
          console.log(
            "Saving temp session user message to database, length:",
            message.length
          );
        }

        // questionId를 안전한 정수로 변환
        const safeQIdx = questionId
          ? Math.abs(parseInt(questionId) % 2147483647)
          : 0;
        console.log(
          "🔍 DEBUG: temp session questionId =",
          questionId,
          "→ safeQIdx =",
          safeQIdx
        );

        const { error: userMessageError } = await supabase
          .from("messages")
          .insert([
            {
              session_id: actualSessionId,
              q_idx: safeQIdx,
              role: "user",
              content: message,
            },
          ]);

        if (userMessageError) {
          console.error(
            "Error saving temp session user message:",
            userMessageError
          );
        }

        // 같은 문제(q_idx)의 이전 대화 이력 조회
        const { data: previousMessages, error: historyError } = await supabase
          .from("messages")
          .select("role, content")
          .eq("session_id", actualSessionId)
          .eq("q_idx", safeQIdx)
          .order("created_at", { ascending: true })
          .limit(20); // 최근 20개 메시지만 (토큰 제한 고려)

        if (historyError) {
          console.error("Error fetching conversation history:", historyError);
        }

        // 현재 메시지를 제외한 이전 메시지들만 필터링 (방금 저장한 메시지 제외)
        const conversationHistory =
          previousMessages
            ?.filter((msg) => msg.role === "user" || msg.role === "ai")
            .slice(0, -1) // 마지막 메시지(방금 저장한 것) 제외
            .map((msg) => ({
              role:
                msg.role === "ai" ? ("assistant" as const) : ("user" as const),
              content: msg.content,
            })) || [];

        if (process.env.NODE_ENV === "development") {
          console.log(
            "📜 Conversation history loaded:",
            conversationHistory.length,
            "messages"
          );
        }

        const aiResponse = await getAIResponse(
          tempSystemPrompt,
          message,
          0.2,
          conversationHistory
        );

        // Ensure we have a valid response
        if (
          !aiResponse ||
          typeof aiResponse !== "string" ||
          aiResponse.trim().length === 0
        ) {
          console.error("Invalid AI response received:", aiResponse);
          return NextResponse.json(
            { error: "Failed to generate AI response" },
            { status: 500 }
          );
        }

        // AI 응답 DB 저장 (임시 세션도 저장)
        if (actualSessionId && !actualSessionId.startsWith("temp_")) {
          if (process.env.NODE_ENV === "development") {
            console.log(
              "Saving temp session AI response to database, length:",
              aiResponse.length
            );
          }

          // AI 메시지용 safeQIdx 재사용 (임시 세션에서는 다시 선언 필요)
          const aiSafeQIdx = questionId
            ? Math.abs(parseInt(questionId) % 2147483647)
            : 0;

          const { error: aiMessageError } = await supabase
            .from("messages")
            .insert([
              {
                session_id: actualSessionId,
                q_idx: aiSafeQIdx,
                role: "ai",
                content: aiResponse,
              },
            ]);

          if (aiMessageError) {
            console.error(
              "Error saving temp session AI message:",
              aiMessageError
            );
          }

          // 세션 사용 횟수 업데이트
          const { data: currentSession } = await supabase
            .from("sessions")
            .select("used_clarifications")
            .eq("id", actualSessionId)
            .single();

          await supabase
            .from("sessions")
            .update({
              used_clarifications:
                (currentSession?.used_clarifications || 0) + 1,
            })
            .eq("id", actualSessionId);
        }

        console.log(
          "Returning temp session response, length:",
          aiResponse.length
        );

        const requestDuration = Date.now() - requestStartTime;
        console.log(
          `⏱️  [PERFORMANCE] Total request time (temp): ${requestDuration}ms`
        );
        console.log(
          `✅ [SUCCESS] Chat request completed | Session: ${actualSessionId} | Q: ${questionId}`
        );

        return NextResponse.json({
          response: aiResponse,
          timestamp: new Date().toISOString(),
          examCode: requestExamCode || "TEMP",
          questionId: questionId || "temp",
        });
      } else {
        // 임시 세션이지만 DB에 저장할 수 없는 경우 (examId나 studentId가 없는 경우)
        const aiResponse = await getAIResponse(tempSystemPrompt, message, 0.2);

        // Ensure we have a valid response
        if (
          !aiResponse ||
          typeof aiResponse !== "string" ||
          aiResponse.trim().length === 0
        ) {
          console.error("Invalid AI response received:", aiResponse);
          return NextResponse.json(
            { error: "Failed to generate AI response" },
            { status: 500 }
          );
        }

        const requestDuration = Date.now() - requestStartTime;
        console.log(
          `⏱️  [PERFORMANCE] Total request time (temp, no DB): ${requestDuration}ms`
        );

        return NextResponse.json({
          response: aiResponse,
          timestamp: new Date().toISOString(),
          examCode: requestExamCode || "TEMP",
          questionId: questionId || "temp",
        });
      }
    }

    // ✅ 정규 세션 처리
    console.log(
      "🔍 DEBUG: Entering REGULAR session processing for sessionId:",
      sessionId
    );
    if (process.env.NODE_ENV === "development") {
      console.log("Looking up session:", sessionId);
    }

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Invalid session", details: sessionError?.message },
        { status: 400 }
      );
    }

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("code, title, questions, materials, rubric")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return NextResponse.json(
        { error: "Exam not found", details: examError?.message },
        { status: 400 }
      );
    }

    // 현재 문제의 핵심 역량 찾기
    let dbCoreAbility = "";
    if (questionId && exam?.questions) {
      const questionIndex = parseInt(questionId);
      if (!isNaN(questionIndex) && exam.questions[questionIndex]) {
        dbCoreAbility = exam.questions[questionIndex].core_ability || "";
      }
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

${
  exam?.rubric && exam.rubric.length > 0
    ? `
**평가 루브릭:**
${exam.rubric
  .map(
    (
      item: {
        evaluationArea: string;
        detailedCriteria: string;
        weight: number;
      },
      index: number
    ) =>
      `${index + 1}. ${item.evaluationArea} (중요도: ${item.weight}%)
   - 세부 기준: ${item.detailedCriteria}`
  )
  .join("\n")}

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
`
    : ""
}

`;

    // Get or create session for this student and exam
    let actualSessionId = sessionId;

    // If using temporary session, try to find or create a real session
    if (sessionId.startsWith("temp_")) {
      const { data: existingSession } = await supabase
        .from("sessions")
        .select("id")
        .eq("exam_id", examId)
        .eq("student_id", studentId)
        .single();

      if (existingSession) {
        actualSessionId = existingSession.id;
      } else {
        // Create new session
        const { data: newSession, error: createError } = await supabase
          .from("sessions")
          .insert([
            {
              exam_id: examId,
              student_id: studentId,
            },
          ])
          .select()
          .single();

        if (createError) {
          console.error("Error creating session:", createError);
          // Continue with temp session
        } else {
          actualSessionId = newSession.id;
        }
      }
    }

    // User message data preparation
    if (process.env.NODE_ENV === "development") {
      console.log("Saving user message to database, length:", message.length);
    }

    // 메시지 DB 저장 (유저 → AI)
    // Use questionIdx if available, otherwise fall back to questionId conversion
    let safeQIdx: number;
    if (questionIdx !== undefined && questionIdx !== null) {
      safeQIdx = parseInt(String(questionIdx));
      console.log(
        "🔍 DEBUG: Using questionIdx =",
        questionIdx,
        "→ safeQIdx =",
        safeQIdx
      );
    } else if (questionId) {
      // Fallback: questionId를 안전한 정수로 변환 (PostgreSQL integer 범위: -2^31 ~ 2^31-1)
      safeQIdx = Math.abs(parseInt(questionId) % 2147483647);
      console.log(
        "🔍 DEBUG: Using questionId =",
        questionId,
        "→ safeQIdx =",
        safeQIdx
      );
    } else {
      safeQIdx = 0;
      console.log(
        "🔍 DEBUG: No question identifier, using default safeQIdx = 0"
      );
    }

    const { error: userMessageError } = await supabase.from("messages").insert([
      {
        session_id: actualSessionId,
        q_idx: safeQIdx,
        role: "user",
        content: message,
      },
    ]);

    if (userMessageError) {
      console.error("Error saving user message:", userMessageError);
    }

    // 같은 문제(q_idx)의 이전 대화 이력 조회
    const { data: previousMessages, error: historyError } = await supabase
      .from("messages")
      .select("role, content")
      .eq("session_id", actualSessionId)
      .eq("q_idx", safeQIdx)
      .order("created_at", { ascending: true })
      .limit(20); // 최근 20개 메시지만 (토큰 제한 고려)

    if (historyError) {
      console.error("Error fetching conversation history:", historyError);
    }

    // 현재 메시지를 제외한 이전 메시지들만 필터링 (방금 저장한 메시지 제외)
    const conversationHistory =
      previousMessages
        ?.filter((msg) => msg.role === "user" || msg.role === "ai")
        .slice(0, -1) // 마지막 메시지(방금 저장한 것) 제외
        .map((msg) => ({
          role: msg.role === "ai" ? ("assistant" as const) : ("user" as const),
          content: msg.content,
        })) || [];

    if (process.env.NODE_ENV === "development") {
      console.log(
        "📜 Conversation history loaded:",
        conversationHistory.length,
        "messages"
      );
    }

    const aiResponse = await getAIResponse(
      systemPrompt,
      message,
      0.2,
      conversationHistory
    );

    // Ensure we have a valid response
    if (
      !aiResponse ||
      typeof aiResponse !== "string" ||
      aiResponse.trim().length === 0
    ) {
      console.error("Invalid AI response received:", aiResponse);
      return NextResponse.json(
        { error: "Failed to generate AI response" },
        { status: 500 }
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.log("Saving AI response to database, length:", aiResponse.length);
    }

    // AI response data preparation - already logged above

    // AI 메시지용 safeQIdx 재사용

    const { error: aiMessageError } = await supabase.from("messages").insert([
      {
        session_id: actualSessionId,
        q_idx: safeQIdx,
        role: "ai",
        content: aiResponse,
      },
    ]);

    if (aiMessageError) {
      console.error("Error saving AI message:", aiMessageError);
    }

    await supabase
      .from("sessions")
      .update({
        used_clarifications: (session.used_clarifications ?? 0) + 1,
      })
      .eq("id", actualSessionId);

    if (process.env.NODE_ENV === "development") {
      console.log("Returning regular session response");
    }

    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Total request time (regular): ${requestDuration}ms`
    );
    console.log(
      `✅ [SUCCESS] Chat request completed | Session: ${actualSessionId} | Q: ${questionId} | Clarifications used: ${
        (session.used_clarifications ?? 0) + 1
      }`
    );

    return NextResponse.json({
      response: aiResponse,
      timestamp: new Date().toISOString(),
      examCode: exam.code,
      questionId,
    });
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    console.error("Chat API error:", error);
    console.error(
      `❌ [ERROR] Chat request failed after ${requestDuration}ms | Error: ${
        (error as Error)?.message
      }`
    );

    // Ensure we always return a proper error response
    const errorMessage = (error as Error)?.message || "Unknown error occurred";
    const errorResponse = {
      error: "Internal server error",
      details: errorMessage,
      timestamp: new Date().toISOString(),
    };

    console.error("Returning error response:", errorResponse);

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
