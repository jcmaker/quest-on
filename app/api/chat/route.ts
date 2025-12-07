import { NextRequest, NextResponse } from "next/server";
import { openai, AI_MODEL } from "@/lib/openai";
import { createClient } from "@supabase/supabase-js";

// Supabase 서버 전용 클라이언트 (절대 클라이언트에 노출 금지)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, // 서버 전용 env 사용 (NEXT_PUBLIC은 브라우저에서도 접근 가능하지만 서버에서는 안전하게 사용)
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 공통 Completion 함수
async function getAIResponse(
  systemPrompt: string,
  userMessage: string,
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
      model: AI_MODEL,
      messages,
      // 여기 나중에 꼭 막아야 할곳 아니면 you broke
      // max_tokens: 600,
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

      // 병렬 처리: 메시지 저장과 히스토리 조회를 동시에 실행
      let conversationHistory: Array<{
        role: "user" | "assistant";
        content: string;
      }> = [];

      if (actualSessionId && !actualSessionId.startsWith("temp_")) {
        const insertPromise = supabase.from("messages").insert([
          {
            session_id: actualSessionId,
            q_idx: safeQIdx,
            role: "user",
            content: message,
          },
        ]);

        const historyPromise = supabase
          .from("messages")
          .select("role, content")
          .eq("session_id", actualSessionId)
          .eq("q_idx", safeQIdx)
          .order("created_at", { ascending: true })
          .limit(20);

        // 병렬 실행 대기
        const [insertResult, historyResult] = await Promise.all([
          insertPromise,
          historyPromise,
        ]);

        if (insertResult.error)
          console.error(
            "Error saving temp session user message:",
            insertResult.error
          );

        // 히스토리 처리
        conversationHistory = (historyResult.data || [])
          // 현재 메시지(방금 insert한 것일 수 있음)를 제외하거나 포함하는 로직
          // 여기서는 단순히 이전 기록들을 가져와서 사용.
          // insert된 메시지가 select에 포함될지는 타이밍에 따라 다르므로,
          // 명시적으로 필터링하지 않고 가져온 것 + 현재 메시지를 getAIResponse에서 조합함.
          // 하지만 getAIResponse는 history + currentMessage 구조이므로 history에는 currentMessage가 없어야 함.
          // insert가 먼저 완료되면 history에 포함될 수 있음.
          // 안전하게: history에서 현재 메시지와 동일한 내용이 가장 마지막에 있다면 제거
          .filter((msg) => msg.role === "user" || msg.role === "ai")
          .map((msg) => ({
            role:
              msg.role === "ai" ? ("assistant" as const) : ("user" as const),
            content: msg.content,
          }));

        // 만약 history의 마지막 메시지가 방금 보낸 메시지와 같다면 제거 (중복 방지)
        if (
          conversationHistory.length > 0 &&
          conversationHistory[conversationHistory.length - 1].content ===
            message
        ) {
          conversationHistory.pop();
        }
      }

      const aiResponse = await getAIResponse(
        tempSystemPrompt,
        message,
        conversationHistory
      );

      // AI 응답 저장 및 세션 업데이트 (병렬 처리)
      if (
        actualSessionId &&
        !actualSessionId.startsWith("temp_") &&
        aiResponse
      ) {
        // 1. AI 메시지 저장
        const saveAiMsgPromise = supabase.from("messages").insert([
          {
            session_id: actualSessionId,
            q_idx: safeQIdx,
            role: "ai",
            content: aiResponse,
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
- 너는 특정한 가상의 상황을 가정하고 문제를 출제했다. 
학생이 묻는 질문에는 반드시 너가 가정한 '특정한 가상의 상황'에 기반해서 답해줘
- 너는 대학 강의의 교수자(Professor) 역할이다.  
- 나는 해당 수업의 학생(Student)으로서 개방형 문제를 해결하기 위해 질문한다.  
- 너는 나의 사고를 확장시키기 위해 **가상의 상황, 수치, 사례, 데이터**를 자유롭게 설정해 대화한다.  
- 이때 제시되는 모든 수치는 실제가 아닌 **학습용 시뮬레이션 예시**로 간주되며, 이를 따로 언급하지 않는다.  
- 답변은 실제 교수-학생의 질의응답처럼 진행한다. 
- ~ㅂ니다 라는 말을 사용한다.

규칙(Rules):
1. 대신 **가정, 수치, 표, 구조적 프레임**을 통해 학생이 추론하도록 돕는다.  
2. “가상의 예시임”, “실제 데이터를 바탕으로 해야 한다” 등의 문장은 절대 사용하지 않는다.  
   (그 정보는 시스템적으로 이미 인지된 것으로 간주한다.)  
3. 답변은 묻는 말에만 간결하게 답한다.
4. 학생 질문이 모호할 경우, **비교 기준·분석 단위·시간축** 등을 되물어 명확히 한다.  
5. 평가 루브릭의 핵심 역량(논리적 근거, 자료 분석, 의사결정 근거)을 반영한다.
6. 가상의 상황을 주고난 뒤 그에 대한 해석이나 분석을 제공하지 않는다.
7. 항상 질문에 대한 답변을 하나의 완결된 문단으로 끝까지 작성합니다.
8. 문단 중간에 끊지 말고, 마지막 문장까지 자연스럽게 마무리합니다.
`
    : ""
}
`;

    // 2. 병렬 처리: 사용자 메시지 DB 저장 & 대화 이력 조회
    const insertUserMsgPromise = supabase.from("messages").insert([
      {
        session_id: sessionId,
        q_idx: safeQIdx,
        role: "user",
        content: message,
      },
    ]);

    const fetchHistoryPromise = supabase
      .from("messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .eq("q_idx", safeQIdx)
      .order("created_at", { ascending: true })
      .limit(20); // 최근 20개

    // Wait for both
    const [userMsgResult, historyResult] = await Promise.all([
      insertUserMsgPromise,
      fetchHistoryPromise,
    ]);

    if (userMsgResult.error) {
      console.error("Error saving user message:", userMsgResult.error);
    }
    if (historyResult.error) {
      console.error(
        "Error fetching conversation history:",
        historyResult.error
      );
    }

    // 히스토리 필터링 및 가공
    const conversationHistory = (historyResult.data || [])
      .filter((msg) => msg.role === "user" || msg.role === "ai")
      .map((msg) => ({
        role: msg.role === "ai" ? ("assistant" as const) : ("user" as const),
        content: msg.content,
      }));

    // 중복 제거: 만약 히스토리의 마지막 메시지가 현재 메시지와 같다면 제거
    // (insert가 fetch보다 먼저 완료되었을 경우를 대비)
    if (
      conversationHistory.length > 0 &&
      conversationHistory[conversationHistory.length - 1].content === message
    ) {
      conversationHistory.pop();
    }

    if (process.env.NODE_ENV === "development") {
      console.log(
        "📜 Conversation history loaded:",
        conversationHistory.length
      );
    }

    // 3. OpenAI 호출
    const aiResponse = await getAIResponse(
      systemPrompt,
      message,
      conversationHistory
    );

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

    // 4. 병렬 처리: AI 응답 DB 저장 & 세션 업데이트
    const insertAiMsgPromise = supabase.from("messages").insert([
      {
        session_id: sessionId,
        q_idx: safeQIdx,
        role: "ai",
        content: aiResponse,
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
