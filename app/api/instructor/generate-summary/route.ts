import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@clerk/nextjs/server";
import { openai, AI_MODEL } from "@/lib/openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID required" },
        { status: 400 }
      );
    }

    // Fetch session
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id, student_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Fetch exam
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, questions, rubric, instructor_id")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    if (exam.instructor_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch submissions
    const { data: submissions, error: submissionsError } = await supabase
      .from("submissions")
      .select("*")
      .eq("session_id", sessionId);

    if (submissionsError) {
      throw submissionsError;
    }

    // Process submissions
    const processedSubmissions = submissions.map((sub) => {
      let answer = sub.answer;
      if (sub.compressed_answer_data) {
        try {
          const decompressed = decompressData(sub.compressed_answer_data);
          answer = (decompressed as { answer?: string }).answer || answer;
        } catch (e) {
          console.error("Decompression error", e);
        }
      }
      return {
        q_idx: sub.q_idx,
        answer,
      };
    });

    // Construct Prompt
    const questionsText = (exam.questions as Record<string, unknown>[])
      .map((q: Record<string, unknown>, i: number) => {
        const sub = processedSubmissions.find((s) => s.q_idx === (q.idx ?? i));
        return `문제 ${i + 1}: ${q.prompt || q.text}\n학생 답안: ${
          sub ? sub.answer : "답안 없음"
        }`;
      })
      .join("\n\n");

    const rubricText = Array.isArray(exam.rubric)
      ? exam.rubric
          .map(
            (r: Record<string, unknown>) =>
              `- ${r.evaluationArea}: ${r.detailedCriteria}`
          )
          .join("\n")
      : "별도의 루브릭 없음";

    const systemPrompt = `당신은 학생의 시험 답안을 깊이 있게 평가하는 전문 교육가 AI입니다. 학생의 답안을 상세하게 분석하여 강점과 약점을 파악하고, 실질적인 조언을 제공해야 합니다. 단순한 나열이 아닌, 논리적 흐름과 근거를 바탕으로 분석해주세요.`;
    const userPrompt = `
시험 제목: ${exam.title}

[평가 루브릭]
${rubricText}

[학생의 답안]
${questionsText}

위 내용을 바탕으로 학생의 전체적인 수행 능력을 상세하게 분석하여 요약 평가해주세요.
다음 항목을 반드시 포함해야 합니다:
1. 전체적인 평가 (긍정적/부정적/중립적)
2. 종합 의견: 학생의 답안 전반에 대한 깊이 있는 분석. 답안의 논리성, 정확성, 창의성 등을 종합적으로 고려하세요.
3. 주요 강점 (3가지 이내): 구체적인 예시를 들어 설명하세요.
4. 개선이 필요한 점 (3가지 이내): 구체적인 개선 방안과 함께 제시하세요.
5. 핵심 인용구 (2가지): 학생의 답안 중 평가에 결정적인 영향을 미친 문장이나 구절을 2개 뽑아주세요. (하이라이트용)

JSON 형식으로 응답해주세요:
{
  "sentiment": "positive" | "negative" | "neutral",
  "summary": "상세한 종합 의견 텍스트",
  "strengths": ["강점1", "강점2", ...],
  "weaknesses": ["약점1", "약점2", ...],
  "keyQuotes": ["인용구1", "인용구2"]
}
`;

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");

    // Save summary to database
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ ai_summary: result })
      .eq("id", sessionId);

    if (updateError) {
      console.error("Error saving summary to database:", updateError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({ summary: result });
  } catch (error: unknown) {
    console.error("Summary generation error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
