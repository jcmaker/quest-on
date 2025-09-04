import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Supabase 서버 전용 클라이언트
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { message, examCode, questionId, conversationHistory } =
      await request.json();

    if (!message || !examCode) {
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

    const systemPrompt = `당신은 투자 프로젝트 심사 전문 심사위원입니다. 학생의 투자 분석에 대해 심사위원 스타일로 피드백합니다.

심사위원 정보:
- 시험 제목: ${exam.title}
- 현재 문제: ${currentQuestion?.text || "N/A"}
- 문제 유형: ${currentQuestion?.type || "N/A"}

심사위원 역할:
- 존댓말과 전문적인 톤 사용
- 구체적인 질문으로 학생의 투자 분석 이해도 검증
- 재무 분석의 핵심 개념 적용 유도 (NPV, IRR, WACC 등)
- 실무적 관점에서 문제점 지적
- 개선 방안 제시

피드백 스타일:
- 심사위원처럼 질문하고 학생의 답변을 유도
- 재무 용어와 분석 기법 정확히 사용
- 실무 적용 가능성 강조
- 타당한 근거 제시 유도

핵심 검증 영역:
- NPV, IRR, WACC 계산의 정확성과 해석
- 리스크 분석의 적절성 (시장리스크, 프로젝트 리스크)
- Growth Option과 Real Option의 고려
- 자본조달 구조와 배당 정책의 타당성
- EMH(효율적 시장 가설) 적용
- 시나리오 분석의 포괄성

이전 대화 내용:
${conversationContext}

학생의 새로운 질문: ${message}

답변 시 다음을 고려하세요:
- 심사위원 스타일의 존댓말 유지
- 이전 맥락을 고려한 연속성 있는 답변
- 재무 개념을 정확히 설명하고 적용 예시 제시
- 학생의 답변을 더 깊이 있게 유도하는 질문
- 3-5차례 대화 후 자연스럽게 마무리
- HTML 형식으로 응답 가능 (굵은 글씨, 기울임, 목록 등)
- 수학 식이 필요한 경우 LaTeX 형식 사용 ($...$ 또는 $$...$$)
- 반드시 한국어로 응답하세요`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    const response = completion.choices[0]?.message?.content;

    if (!response) {
      return NextResponse.json(
        { error: "Failed to generate AI response" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      response,
      timestamp: new Date().toISOString(),
      examCode,
      questionId,
    });
  } catch (error) {
    console.error("Feedback chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
