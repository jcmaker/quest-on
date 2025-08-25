import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { message, examCode, questionId } = await request.json();

    if (!message || !examCode) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // TODO: Validate exam code and question ID from Supabase
    // TODO: Check if student is authorized to take this exam

    const systemPrompt = `당신은 시험 중인 학생을 도와주는 도움이 되는 교수 보조입니다. 
    학생이 시험 코드: ${examCode}로 시험을 치르고 있습니다.
    ${questionId ? `현재 문제 ID: ${questionId}에 있습니다` : ""}
    
    당신의 역할은:
    1. 답을 직접 알려주지 않고 시험 문제에 대한 설명을 제공하기
    2. 학생이 무엇을 묻고 있는지 이해하도록 도와주기
    3. 올바른 접근 방법으로 안내하기
    4. 격려하고 지원하기
    5. 응답을 간결하고 집중적으로 유지하기
    6. 힌트와 방향성만 제시하세요
    7. 학생이 스스로 문제를 해결하도록 유도하세요
    
    하지 말아야 할 것:
    - 시험 문제에 대한 직접적인 답 제공
    - 해답 제공
    - 기본 산술이 아닌 계산 도움
    - 부정행위로 간주될 수 있는 상세한 설명 제공
    
    응답을 200단어 이하로 유지하고 학생이 문제를 더 잘 이해하도록 도와주는 데 집중하세요.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const response =
      completion.choices[0]?.message?.content ||
      "I'm sorry, I couldn't process your question. Please try rephrasing it.";

    // TODO: Log this interaction to Supabase for instructor review

    return NextResponse.json({
      response,
      timestamp: new Date().toISOString(),
      examCode,
      questionId,
    });
  } catch (error) {
    console.error("Chat API error:", error);

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
