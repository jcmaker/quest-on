/**
 * 대화형 피드백 기능 (Conversational Feedback)
 * - 현재 학생 최종 제출 흐름에서는 사용되지 않음
 * - 향후 답안 제출 후 AI와의 대화형 피드백을 제공하기 위한 API 엔드포인트
 * - 클라이언트에서 '/api/feedback-chat' 호출 시, 루브릭/문제 맥락 기반으로 응답 생성
 */
import { NextRequest, NextResponse } from "next/server";
import { openai, AI_MODEL } from "@/lib/openai";
import { createClient } from "@supabase/supabase-js";
import { compressData } from "@/lib/compression";
import { buildFeedbackChatSystemPrompt, type RubricItem } from "@/lib/prompts";

// 메시지 타입 분류 함수 (개념/계산/전략/기타)
async function classifyMessageType(
  message: string
): Promise<"concept" | "calculation" | "strategy" | "other"> {
  try {
    const lowerMessage = message.toLowerCase();

    if (
      /\d+|\+|\-|\*|\/|계산|연산|공식|수식|값|결과/.test(lowerMessage) ||
      /how much|calculate|compute|solve|equation/.test(lowerMessage)
    ) {
      return "calculation";
    }

    if (
      /방법|전략|접근|절차|과정|어떻게|how to|way|method|strategy|approach/.test(
        lowerMessage
      )
    ) {
      return "strategy";
    }

    if (
      /무엇|뭐|의미|정의|개념|이유|왜|what|meaning|definition|concept|why/.test(
        lowerMessage
      )
    ) {
      return "concept";
    }

    return "other";
  } catch (error) {
    console.error("Error classifying message type:", error);
    return "other";
  }
}

// Supabase 서버 전용 클라이언트
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  try {
    const { message, examCode, questionId, conversationHistory, studentId } =
      await request.json();

    console.log(
      `📨 [FEEDBACK_CHAT] Request received | Student: ${
        studentId || "unknown"
      } | Exam: ${examCode} | Question: ${questionId}`
    );

    if (!message || !examCode) {
      console.error(
        `❌ [VALIDATION] Missing required fields | examCode: ${!!examCode} | message: ${!!message}`
      );
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 시험 정보 조회
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("code", examCode)
      .single();

    if (examError || !exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // 현재 문제 찾기
    interface QuestionData {
      id: string;
      text: string;
      type: string;
    }

    const currentQuestion =
      exam.questions?.find((q: QuestionData) => q.id === questionId) ||
      exam.questions?.[0];

    // 대화 히스토리에서 이전 메시지들을 프롬프트로 구성
    interface MessageData {
      type: string;
      content: string;
    }

    const conversationContext =
      conversationHistory
        ?.slice(-10) // 최근 10개 메시지만 사용
        .map(
          (msg: MessageData) =>
            `${msg.type === "ai" ? "AI" : "Student"}: ${msg.content}`
        )
        .join("\n") || "";

    const systemPrompt = buildFeedbackChatSystemPrompt({
      examTitle: exam.title,
      currentQuestionText: currentQuestion?.text,
      currentQuestionType: currentQuestion?.type,
      rubric: exam?.rubric as RubricItem[] | undefined,
      conversationContext,
      message,
    });

    const aiStartTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_completion_tokens: 500,
    });
    const aiDuration = Date.now() - aiStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Feedback OpenAI response time: ${aiDuration}ms`
    );

    const response = completion.choices[0]?.message?.content;
    const tokensUsed = completion.usage?.total_tokens || null; // 토큰 사용량 추출

    if (!response) {
      return NextResponse.json(
        { error: "Failed to generate AI response" },
        { status: 500 }
      );
    }

    // Store feedback chat interaction with compression
    if (studentId) {
      try {
        // 메시지 타입 분류
        const messageType = await classifyMessageType(message);

        // Get or create session for this student and exam
        const { data: session, error: sessionError } = await supabase
          .from("sessions")
          .select("id")
          .eq("exam_id", exam.id)
          .eq("student_id", studentId)
          .single();

        let sessionId;
        if (sessionError || !session) {
          // Create new session
          const { data: newSession, error: createError } = await supabase
            .from("sessions")
            .insert([
              {
                exam_id: exam.id,
                student_id: studentId,
                submitted_at: new Date().toISOString(),
              },
            ])
            .select()
            .single();

          if (createError) throw createError;
          sessionId = newSession.id;
        } else {
          sessionId = session.id;
        }

        // Compress the chat interaction
        const chatInteraction = {
          studentMessage: message,
          aiResponse: response,
          timestamp: new Date().toISOString(),
          examCode,
          questionId,
        };

        const compressedData = compressData(chatInteraction);

        // Store in messages table with compression, message type, and tokens
        const { error: insertError } = await supabase.from("messages").insert([
          {
            session_id: sessionId,
            q_idx: questionId ? parseInt(questionId) : 0,
            role: "user",
            content: message,
            message_type: messageType,
            compressed_content: compressedData.data,
            compression_metadata: compressedData.metadata,
            created_at: new Date().toISOString(),
          },
          {
            session_id: sessionId,
            q_idx: questionId ? parseInt(questionId) : 0,
            role: "ai",
            content: response,
            tokens_used: tokensUsed,
            metadata: tokensUsed
              ? {
                  prompt_tokens: completion.usage?.prompt_tokens || 0,
                  completion_tokens: completion.usage?.completion_tokens || 0,
                  total_tokens: tokensUsed,
                }
              : {},
            compressed_content: compressedData.data,
            compression_metadata: compressedData.metadata,
            created_at: new Date().toISOString(),
          },
        ]);

        if (insertError) {
          console.error("Failed to store chat interaction:", insertError);
        } else {
          console.log("Chat interaction compressed and stored:", {
            sessionId,
            originalSize: compressedData.metadata.originalSize,
            compressedSize: compressedData.metadata.compressedSize,
            compressionRatio: compressedData.metadata.compressionRatio,
          });
        }
      } catch (error) {
        console.error("Error storing chat interaction:", error);
        // Continue with response even if storage fails
      }
    }

    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Total feedback chat request time: ${requestDuration}ms`
    );
    console.log(
      `✅ [SUCCESS] Feedback chat completed | Student: ${studentId} | Question: ${questionId}`
    );

    return NextResponse.json({
      response,
      timestamp: new Date().toISOString(),
      examCode,
      questionId,
    });
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    console.error("Feedback chat API error:", error);
    console.error(
      `❌ [ERROR] Feedback chat failed after ${requestDuration}ms | Error: ${
        (error as Error)?.message
      }`
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
