import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { examCode, answers, examId } = await request.json();

    if (!examCode || !answers || !Array.isArray(answers)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // TODO: Validate exam submission from Supabase
    // TODO: Check if student is authorized and exam is still active
    // TODO: Store submission in database

    // Prepare the feedback prompt
    const answersText = answers
      .map(
        (answer: { text?: string }, index: number) =>
          `문제 ${index + 1}: ${answer.text || "답안이 작성되지 않았습니다"}`
      )
      .join("\n\n");

    const systemPrompt = `당신은 재무/투자 분야의 전문 심사위원입니다. 학생의 투자 프로젝트 분석 답안을 심사위원 스타일로 피드백합니다.

심사위원 역할:
- 존댓말과 전문적인 톤 사용
- 구체적인 질문으로 학생의 이해도 검증
- 재무 분석의 핵심 개념 적용 유도
- 실무적 관점에서 문제점 지적
- 개선 방안 제시

피드백 형식:
1. 각 답안별로 2-3개의 핵심 질문 제기
2. 학생의 답변을 유도하는 Q&A 형식
3. 재무 용어와 분석 기법 정확히 사용
4. 최종 종합 평가로 마무리

핵심 검증 포인트:
- NPV, IRR, WACC 등 재무 지표의 정확한 계산과 해석
- 리스크 분석 (시장리스크, 프로젝트 리스크)
- Growth Option과 Real Option 고려
- 자본조달 구조와 배당 정책의 타당성
- EMH(효율적 시장 가설) 적용
- 시나리오 분석의 적절성

응답은 반드시 한국어로 작성하고, 심사위원 스타일의 존댓말을 사용하세요.`;

    const userPrompt = `다음 투자 프로젝트 분석 답안에 대해 심사위원 스타일의 피드백을 제공해주세요:

${answersText}

심사위원처럼 2-3개의 핵심 질문을 제기하고, 학생의 답변을 유도하는 Q&A 형식으로 피드백해주세요.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const feedback =
      completion.choices[0]?.message?.content ||
      "Unable to generate feedback at this time.";

    // TODO: Store feedback in Supabase
    // TODO: Calculate and store score if applicable
    // TODO: Send notification to instructor

    return NextResponse.json({
      feedback,
      timestamp: new Date().toISOString(),
      examCode,
      examId,
      status: "submitted",
    });
  } catch (error) {
    console.error("Feedback API error:", error);

    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        { error: "OpenAI API error", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
