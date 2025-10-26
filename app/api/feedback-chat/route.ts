import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { compressData } from "@/lib/compression";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
      core_ability?: string;
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

    const systemPrompt = `당신은 학문 분야의 전문 심사위원입니다. 학생의 답안에 대해 심사위원 스타일로 피드백합니다.

심사위원 정보:
- 시험 제목: ${exam.title}
- 현재 문제: ${currentQuestion?.text || "N/A"}
- 문제 유형: ${currentQuestion?.type || "N/A"}

${
  exam?.rubric && exam.rubric.length > 0
    ? `
**평가 루브릭 기준:**
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

심사위원 역할:
- 존댓말과 전문적인 톤 사용
- 구체적인 질문으로 학생의 이해도 검증
- 해당 분야의 핵심 개념 적용 유도
- 실무적 관점에서 문제점 지적
- 개선 방안 제시
${
  exam?.rubric && exam.rubric.length > 0
    ? "- **제공된 평가 루브릭 기준에 따라 답안을 평가하고 피드백 제공**"
    : ""
}

피드백 스타일:
- 심사위원처럼 질문하고 학생의 답변을 유도
- 해당 분야의 전문 용어와 분석 기법 정확히 사용
- 실무 적용 가능성 강조
- 타당한 근거 제시 유도
${
  exam?.rubric && exam.rubric.length > 0
    ? "- **평가 루브릭의 각 영역별로 답안의 강점과 개선점을 구체적으로 제시**"
    : ""
}

핵심 검증 영역:
- 답안의 논리적 구조와 일관성
- 핵심 개념의 정확한 이해와 적용
- 근거와 증거의 적절성
- 비판적 사고와 분석력
- 창의적 접근과 실무 적용 가능성
- 결론의 타당성과 완성도
${
  exam?.rubric && exam.rubric.length > 0
    ? "- **평가 루브릭에 명시된 각 평가 영역의 달성도**"
    : ""
}

이전 대화 내용:
${conversationContext}

학생의 새로운 질문: ${message}

답변 시 다음을 고려하세요:
- 심사위원 스타일의 존댓말 유지
- 이전 맥락을 고려한 연속성 있는 답변
- 해당 분야의 개념을 정확히 설명하고 적용 예시 제시
- 학생의 답변을 더 깊이 있게 유도하는 질문
- 3-5차례 대화 후 자연스럽게 마무리
- HTML 형식으로 응답 가능 (굵은 글씨, 기울임, 목록 등)
- 수학 식이 필요한 경우 LaTeX 형식 사용 ($...$ 또는 $$...$$)
- 반드시 한국어로 응답하세요`;

    const aiStartTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });
    const aiDuration = Date.now() - aiStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Feedback OpenAI response time: ${aiDuration}ms`
    );

    const response = completion.choices[0]?.message?.content;

    if (!response) {
      return NextResponse.json(
        { error: "Failed to generate AI response" },
        { status: 500 }
      );
    }

    // Store feedback chat interaction with compression
    if (studentId) {
      try {
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

        // Store in messages table with compression
        const { error: insertError } = await supabase.from("messages").insert([
          {
            session_id: sessionId,
            q_idx: questionId ? parseInt(questionId) : 0,
            role: "user",
            content: message,
            compressed_content: compressedData.data,
            compression_metadata: compressedData.metadata,
            created_at: new Date().toISOString(),
          },
          {
            session_id: sessionId,
            q_idx: questionId ? parseInt(questionId) : 0,
            role: "ai",
            content: response,
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
