/**
 * 대화형 피드백 기능 (Conversational Feedback)
 * - 현재 학생 최종 제출 흐름에서는 사용되지 않음
 * - 향후 답안 제출 후 AI와의 대화형 피드백을 제공하기 위한 API 엔드포인트
 * - 클라이언트에서 '/api/feedback-chat' 호출 시, 루브릭/문제 맥락 기반으로 응답 생성
 */
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { openai, AI_MODEL, callOpenAI } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import { compressData } from "@/lib/compression";
import { buildFeedbackChatSystemPrompt, type RubricItem } from "@/lib/prompts";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { classifyMessageType } from "@/lib/message-classification";
import { sanitizeUserInput } from "@/lib/sanitize";
import { z } from "zod";

// Zod schema for this route's specific request shape
const feedbackChatRouteSchema = z.object({
  message: z.string().min(1, "Message is required").max(10000).transform(sanitizeUserInput),
  examCode: z.string().min(1, "Exam code is required"),
  questionId: z.string().optional(),
  conversationHistory: z.array(z.object({
    type: z.string(),
    content: z.string(),
  })).optional(),
  studentId: z.string().optional(),
});

// Supabase 서버 전용 클라이언트
const supabase = getSupabaseServer();

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Rate limiting
    const rl = checkRateLimit(`feedback-chat:${user.id}`, RATE_LIMITS.chat);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const body = await request.json();
    const validation = feedbackChatRouteSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorJson("VALIDATION_ERROR", firstError ? `${firstError.path.join(".")}: ${firstError.message}` : "Invalid request body", 400);
    }
    const { message, examCode, questionId, conversationHistory, studentId } = validation.data;

    // 시험 정보 조회
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, code, questions, rubric")
      .eq("code", examCode)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
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
    const conversationContext =
      conversationHistory
        ?.slice(-10) // 최근 10개 메시지만 사용
        .map(
          (msg) =>
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

    const completion = await callOpenAI(() =>
      openai.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        max_completion_tokens: 500,
      })
    );
    const response = completion.choices[0]?.message?.content;
    const tokensUsed = completion.usage?.total_tokens || null; // 토큰 사용량 추출

    if (!response) {
      return errorJson("INTERNAL_ERROR", "Failed to generate AI response", 500);
    }

    // Store feedback chat interaction with compression
    // Security: use authenticated user's ID, never trust studentId from body
    const verifiedStudentId = user.id;
    if (verifiedStudentId) {
      try {
        // 메시지 타입 분류
        const messageType = await classifyMessageType(message);

        // Get or create session for this student and exam
        const { data: session, error: sessionError } = await supabase
          .from("sessions")
          .select("id")
          .eq("exam_id", exam.id)
          .eq("student_id", verifiedStudentId)
          .single();

        let sessionId;
        if (sessionError || !session) {
          // Create new session
          const { data: newSession, error: createError } = await supabase
            .from("sessions")
            .insert([
              {
                exam_id: exam.id,
                student_id: verifiedStudentId,
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
          logError("Failed to store chat interaction", insertError);
        }
      } catch (error) {
        logError("Error storing chat interaction", error);
        // Continue with response even if storage fails
      }
    }

    return successJson({
      response,
      timestamp: new Date().toISOString(),
      examCode,
      questionId,
    });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
