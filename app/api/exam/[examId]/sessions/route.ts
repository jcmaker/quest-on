import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@clerk/nextjs/server";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get exam to verify instructor owns it
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, instructor_id")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get all sessions for this exam
    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select(
        `
        id,
        student_id,
        submitted_at,
        used_clarifications,
        created_at,
        compressed_session_data,
        compression_metadata,
        submissions (
          id,
          q_idx,
          answer,
          ai_feedback,
          student_reply,
          compressed_answer_data,
          compressed_feedback_data,
          compression_metadata
        ),
        messages (
          id,
          q_idx,
          role,
          content,
          compressed_content,
          compression_metadata,
          created_at
        )
      `
      )
      .eq("exam_id", examId)
      .order("submitted_at", { ascending: false });

    if (sessionsError) {
      throw sessionsError;
    }

    // Process sessions and decompress data
    const processedSessions = sessions.map((session) => {
      // Decompress session data
      let decompressedSessionData = null;
      if (session.compressed_session_data) {
        try {
          decompressedSessionData = decompressData(
            session.compressed_session_data
          );
        } catch (error) {
          console.error(`Error decompressing session ${session.id}:`, error);
        }
      }

      // Decompress submissions data
      const decompressedSubmissions =
        session.submissions?.map((submission: Record<string, unknown>) => {
          let decompressedAnswerData = null;
          let decompressedFeedbackData = null;

          if (submission.compressed_answer_data) {
            try {
              decompressedAnswerData = decompressData(
                submission.compressed_answer_data
              );
            } catch (error) {
              console.error("Error decompressing answer data:", error);
            }
          }

          if (submission.compressed_feedback_data) {
            try {
              decompressedFeedbackData = decompressData(
                submission.compressed_feedback_data
              );
            } catch (error) {
              console.error("Error decompressing feedback data:", error);
            }
          }

          return {
            ...submission,
            decompressed: {
              answerData: decompressedAnswerData,
              feedbackData: decompressedFeedbackData,
            },
          };
        }) || [];

      // Decompress messages data
      const decompressedMessages =
        session.messages?.map((message: Record<string, unknown>) => {
          let decompressedContent = null;

          if (message.compressed_content) {
            try {
              decompressedContent = decompressData(message.compressed_content);
            } catch (error) {
              console.error("Error decompressing message content:", error);
            }
          }

          return {
            ...message,
            decompressed: {
              content: decompressedContent,
            },
          };
        }) || [];

      // Calculate compression stats for this session
      const sessionCompressionStats = {
        session: session.compression_metadata || null,
        submissions:
          session.submissions
            ?.map((s: Record<string, unknown>) => s.compression_metadata)
            .filter(Boolean) || [],
        messages:
          session.messages
            ?.map((m: Record<string, unknown>) => m.compression_metadata)
            .filter(Boolean) || [],
        totalOriginalSize: 0,
        totalCompressedSize: 0,
      };

      // Calculate total compression stats for this session
      if (session.compression_metadata) {
        sessionCompressionStats.totalOriginalSize +=
          session.compression_metadata.originalSize || 0;
        sessionCompressionStats.totalCompressedSize +=
          session.compression_metadata.compressedSize || 0;
      }

      sessionCompressionStats.submissions.forEach((meta: Record<string, unknown>) => {
        sessionCompressionStats.totalOriginalSize += (meta.originalSize as number) || 0;
        sessionCompressionStats.totalCompressedSize += (meta.compressedSize as number) || 0;
      });

      sessionCompressionStats.messages.forEach((meta: Record<string, unknown>) => {
        sessionCompressionStats.totalOriginalSize += (meta.originalSize as number) || 0;
        sessionCompressionStats.totalCompressedSize += (meta.compressedSize as number) || 0;
      });

      return {
        id: session.id,
        student_id: session.student_id,
        submitted_at: session.submitted_at,
        used_clarifications: session.used_clarifications,
        created_at: session.created_at,
        // Decompressed data
        decompressed: decompressedSessionData,
        submissions: decompressedSubmissions,
        messages: decompressedMessages,
        // Compression stats
        compressionStats: sessionCompressionStats,
      };
    });

    // Calculate overall compression stats
    const overallCompressionStats = {
      totalSessions: sessions.length,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      totalSpaceSaved: 0,
    };

    processedSessions.forEach((session) => {
      overallCompressionStats.totalOriginalSize +=
        session.compressionStats.totalOriginalSize;
      overallCompressionStats.totalCompressedSize +=
        session.compressionStats.totalCompressedSize;
    });

    overallCompressionStats.totalSpaceSaved =
      overallCompressionStats.totalOriginalSize -
      overallCompressionStats.totalCompressedSize;

    return NextResponse.json({
      exam: {
        id: exam.id,
        title: exam.title,
      },
      sessions: processedSessions,
      compressionStats: overallCompressionStats,
    });
  } catch (error) {
    console.error("Get exam sessions error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
