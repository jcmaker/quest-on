import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { compressData } from "@/lib/compression";
import { openai, AI_MODEL } from "@/lib/openai";

// Helper function to sanitize text for JSON storage
function sanitizeText(text: string): string {
  if (!text) return "";

  try {
    // First try to JSON.stringify to check if it's valid
    JSON.stringify(text);
    return text.trim();
  } catch (error) {
    console.warn("Text contains invalid JSON characters, sanitizing:", error);

    // More conservative approach: only remove problematic lone surrogates
    return text
      .replace(/[\uD800-\uDFFF]/g, (match, offset, string) => {
        // Check if it's a proper surrogate pair
        const charCode = match.charCodeAt(0);
        if (charCode >= 0xd800 && charCode <= 0xdbff) {
          // High surrogate - check if followed by low surrogate
          const nextChar = string[offset + 1];
          if (
            nextChar &&
            nextChar.charCodeAt(0) >= 0xdc00 &&
            nextChar.charCodeAt(0) <= 0xdfff
          ) {
            return match; // Keep valid surrogate pair
          }
        }
        return ""; // Remove lone surrogate
      })
      .replace(/\u0000/g, "") // Remove null characters
      .trim();
  }
}

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { examCode, answers, examId, sessionId, chatHistory, studentId } =
      await request.json();

    if (!examCode || !answers || !Array.isArray(answers)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate exam submission from Supabase
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("code", examCode)
      .single();

    if (examError || !exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // Check if exam is still active
    if (exam.status !== "active" && exam.status !== "draft") {
      return NextResponse.json(
        { error: "Exam is no longer active" },
        { status: 400 }
      );
    }

    // Prepare the feedback prompt
    const answersText = answers
      .map(
        (answer: { text?: string }, index: number) =>
          `문제 ${index + 1}: ${answer.text || "답안이 작성되지 않았습니다"}`
      )
      .join("\n\n");

    const systemPrompt = `당신은 학문 분야의 전문 심사위원입니다. 학생의 답안을 심사위원 스타일로 피드백합니다.

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
      },
      index: number
    ) =>
      `${index + 1}. ${item.evaluationArea}
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

피드백 형식:
1. 각 답안별로 2-3개의 핵심 질문 제기
2. 학생의 답변을 유도하는 Q&A 형식
3. 해당 분야의 전문 용어와 분석 기법 정확히 사용
4. 최종 종합 평가로 마무리
${
  exam?.rubric && exam.rubric.length > 0
    ? "5. **평가 루브릭의 각 영역별로 답안의 강점과 개선점을 구체적으로 제시**"
    : ""
}

핵심 검증 포인트:
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

응답은 반드시 한국어로 작성하고, 심사위원 스타일의 존댓말을 사용하세요.`;

    const userPrompt = `다음 답안에 대해 심사위원 스타일의 피드백을 제공해주세요:

${answersText}

심사위원처럼 2-3개의 핵심 질문을 제기하고, 학생의 답변을 유도하는 Q&A 형식으로 피드백해주세요.`;

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 1000,
    });

    const feedback =
      completion.choices[0]?.message?.content ||
      "Unable to generate feedback at this time.";

    // Store submission data in database
    if (studentId) {
      try {
        let actualSessionId = sessionId;

        // If sessionId is provided, verify it exists and belongs to this student
        if (sessionId) {
          console.log("Using provided sessionId:", sessionId);
          const { data: existingSession, error: sessionError } = await supabase
            .from("sessions")
            .select("id, student_id, exam_id")
            .eq("id", sessionId)
            .single();

          if (sessionError || !existingSession) {
            console.error("Session not found:", sessionError);
            throw new Error("Invalid session ID");
          }

          if (
            existingSession.student_id !== studentId ||
            existingSession.exam_id !== examId
          ) {
            console.error("Session ownership mismatch");
            throw new Error("Session does not belong to this student/exam");
          }

          actualSessionId = existingSession.id;
        } else {
          // Fallback: Create or get session for this exam (legacy behavior)
          console.log("No sessionId provided, creating/finding session");
          const { data: session, error: sessionError } = await supabase
            .from("sessions")
            .select("id")
            .eq("exam_id", examId)
            .eq("student_id", studentId)
            .single();

          if (sessionError || !session) {
            // Create new session
            const { data: newSession, error: createError } = await supabase
              .from("sessions")
              .insert([
                {
                  exam_id: examId,
                  student_id: studentId,
                  submitted_at: new Date().toISOString(),
                },
              ])
              .select()
              .single();

            if (createError) throw createError;
            actualSessionId = newSession.id;
          } else {
            actualSessionId = session.id;
          }
        }

        // Compress session data
        const sessionData = {
          chatHistory: chatHistory || [],
          answers: answers,
          feedback: feedback,
          feedbackResponses: [],
        };

        const compressedSessionData = compressData(sessionData);

        // Update session with compressed data
        await supabase
          .from("sessions")
          .update({
            compressed_session_data: compressedSessionData.data,
            compression_metadata: compressedSessionData.metadata,
            submitted_at: new Date().toISOString(),
          })
          .eq("id", actualSessionId);

        // Store individual submissions
        const submissionInserts = answers.map(
          (answer: { text?: string } | string, index: number) => {
            const rawAnswerText =
              typeof answer === "string" ? answer : answer.text || "";

            // Sanitize the answer text to prevent JSON encoding issues
            const answerText = sanitizeText(rawAnswerText);
            const sanitizedFeedback = sanitizeText(feedback);

            console.log(`Processing answer ${index + 1}:`, {
              originalLength: rawAnswerText.length,
              sanitizedLength: answerText.length,
              hasUnicodeIssues: rawAnswerText !== answerText,
            });

            const submissionData = {
              answer: answerText,
              feedback: sanitizedFeedback,
              studentReply: null,
            };

            let compressedSubmissionData;
            let compressionMetadata;

            try {
              const compressed = compressData(submissionData);
              compressedSubmissionData = compressed.data;
              compressionMetadata = compressed.metadata;

              // Validate that compressed data is safe for JSON storage
              JSON.stringify({ compressed_data: compressedSubmissionData });
            } catch (compressionError) {
              console.warn(
                `Compression failed for answer ${index + 1}:`,
                compressionError
              );
              // Fallback: store without compression
              compressedSubmissionData = null;
              compressionMetadata = {
                algorithm: "none",
                version: "1.0.0",
                originalSize: JSON.stringify(submissionData).length,
                compressedSize: JSON.stringify(submissionData).length,
                compressionRatio: 1.0,
                timestamp: new Date().toISOString(),
              };
            }

            return {
              session_id: actualSessionId,
              q_idx: index,
              answer: answerText,
              ai_feedback: sanitizedFeedback
                ? { feedback: sanitizedFeedback }
                : null,
              student_reply: null,
              compressed_answer_data: compressedSubmissionData,
              compression_metadata: compressionMetadata,
            };
          }
        );

        console.log(
          "Inserting submissions:",
          submissionInserts.length,
          "items"
        );
        const { data: insertedSubmissions, error: submissionsError } =
          await supabase.from("submissions").insert(submissionInserts).select();

        if (submissionsError) {
          console.error("Submissions insert error:", submissionsError);
          console.error(
            "Failed submission data:",
            JSON.stringify(submissionInserts, null, 2)
          );
          throw new Error(
            `Database insert failed: ${submissionsError.message} (Code: ${submissionsError.code})`
          );
        }

        console.log(
          "Submissions inserted successfully:",
          insertedSubmissions?.length,
          "items"
        );

        // Update exam student count
        const { data: currentExam } = await supabase
          .from("exams")
          .select("student_count")
          .eq("id", examId)
          .single();

        await supabase
          .from("exams")
          .update({
            student_count: (currentExam?.student_count || 0) + 1,
          })
          .eq("id", examId);

        console.log("Exam submission stored successfully:", {
          sessionId: actualSessionId,
          examId,
          studentId,
          submissionsCount: submissionInserts.length,
        });
      } catch (error) {
        console.error("Error storing submission:", error);
        return NextResponse.json(
          {
            error: "Failed to store submission in database",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 }
        );
      }
    }

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
