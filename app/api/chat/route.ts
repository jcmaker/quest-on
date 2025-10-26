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
  temperature = 0.7
) {
  const aiStartTime = Date.now();
  try {
    if (process.env.NODE_ENV === "development") {
      console.log(
        "Calling OpenAI API with prompt length:",
        systemPrompt.length
      );
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
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

      const tempSystemPrompt = `당신은 시험 중인 학생을 도와주는 **시험 보조자(Test/Clarification Assistant)**입니다.
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
- 너는 학생이 주어진 추상적 질문에 답하기 위해 필요한 정보를 탐색하고, 요청에 따라 계산/정리/구조화 작업을 도와주는 **Clarification Assistant**이다.
- 학생이 문제를 이해하고 구체화할 수 있도록 정보를 제공하고, 자료를 재구성하거나 요약하여 문제의 틀을 잡도록 돕는다.
- 최종 해답은 절대 주지 않고, 예시/구조/간단한 표만 제공한다.
- **문제 핵심 역량을 고려하여 학생의 이해도를 높이는 방향으로 도움을 제공한다.**

규칙:
 1. 절대 정답이나, 서술형 문제의 최종 답변을 직접 제공하지 마세요.
 2. 학생이 요청하는 경우, 반드시 가상의 예시(표, 데이터, 수치 등)를 만들어 보여주세요.
    - 예시는 단순하고 직관적이어야 하며, 표 형식을 적극 활용하세요.
-   - 표를 제시할 때는 간단한 맥락 설명까지만 하고, 추가 분석은 언급하지 마세요.
+   - 예시나 표를 제시할 때는 **간단한 맥락 설명까지만 하고, 추가 분석이나 해설은 붙이지 마세요.**
+   - 불필요하게 과목 특화된 용어(재무 분석 지표 등)는 언급하지 말고, 어디까지나 "예시 구조"까지만 보여주세요.
 3. **문제의 핵심 역량을 고려하여 관련 개념이나 접근 방법을 안내한다.**
 4. 응답은 간결하고 명확하게, 200단어(또는 300자) 이내로 제시하세요.
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
      }

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
            used_clarifications: (currentSession?.used_clarifications || 0) + 1,
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

    const systemPrompt = `당신은 시험 중인 학생을 도와주는 **시험 보조자(Test/Clarification Assistant)**입니다.
    
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
`
    : ""
}

역할(Role):
- 너는 학생이 주어진 추상적 질문에 답하기 위해 필요한 정보를 탐색하고, 요청에 따라 계산/정리/구조화 작업을 도와주는 **Clarification Assistant**이다.
- 학생이 문제를 이해하고 구체화할 수 있도록 정보를 제공하고, 자료를 재구성하거나 요약하여 문제의 틀을 잡도록 돕는다.
- 최종 해답은 절대 주지 않고, 예시/구조/간단한 표만 제공한다.
- **문제 핵심 역량과 평가 루브릭을 고려하여 학생의 이해도를 높이는 방향으로 도움을 제공한다.**

규칙:
1. 정답이나 최종 계산 결과를 직접 제공하지 않는다.
2. 학생 요청 시 가상의 예시(표, 데이터, 수치 등)를 간단히 제시한다.
   - 반드시 실제 정답이 아님을 명시한다.
   - 표는 짧은 설명까지만, 추가 분석은 하지 않는다.
3. **문제의 핵심 역량과 평가 루브릭의 기준을 고려하여 관련 개념이나 접근 방법을 안내한다.**
4. 응답은 200단어(300자) 이내.
5. 학생 질문이 모호하면 조건/가정을 되묻고 필요한 설정을 만든다.
6. **평가 루브릭의 각 영역과 기준을 참고하여 학생이 더 나은 답안을 작성할 수 있도록 안내한다.**
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

    const aiResponse = await getAIResponse(systemPrompt, message, 0.2);

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
