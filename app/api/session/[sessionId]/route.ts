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
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get session data with related submissions and messages
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select(
        `
        *,
        exams (
          id,
          title,
          code,
          instructor_id
        ),
        submissions (
          *,
          compressed_answer_data,
          compressed_feedback_data,
          compression_metadata
        ),
        messages (
          *,
          compressed_content,
          compression_metadata
        )
      `
      )
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check if user is authorized to view this session
    const userRole = user.unsafeMetadata?.role as string;
    const isInstructor = userRole === "instructor";
    const isStudentOwner = session.student_id === user.id;

    if (!isInstructor && !isStudentOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // If instructor, check if they own the exam
    if (isInstructor && session.exams.instructor_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Decompress session data if available
    let decompressedSessionData = null;
    if (session.compressed_session_data) {
      try {
        decompressedSessionData = decompressData(
          session.compressed_session_data
        );
      } catch (error) {
        console.error("Error decompressing session data:", error);
      }
    }

    // Decompress submissions data
    const decompressedSubmissions =
      session.submissions?.map((submission: any) => {
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
      session.messages?.map((message: any) => {
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

    // Calculate compression stats
    const compressionStats = {
      session: session.compression_metadata || null,
      submissions:
        session.submissions
          ?.map((s: any) => s.compression_metadata)
          .filter(Boolean) || [],
      messages:
        session.messages
          ?.map((m: any) => m.compression_metadata)
          .filter(Boolean) || [],
      totalOriginalSize: 0,
      totalCompressedSize: 0,
    };

    // Calculate total compression stats
    if (session.compression_metadata) {
      compressionStats.totalOriginalSize +=
        session.compression_metadata.originalSize || 0;
      compressionStats.totalCompressedSize +=
        session.compression_metadata.compressedSize || 0;
    }

    compressionStats.submissions.forEach((meta: any) => {
      compressionStats.totalOriginalSize += meta.originalSize || 0;
      compressionStats.totalCompressedSize += meta.compressedSize || 0;
    });

    compressionStats.messages.forEach((meta: any) => {
      compressionStats.totalOriginalSize += meta.originalSize || 0;
      compressionStats.totalCompressedSize += meta.compressedSize || 0;
    });

    compressionStats.totalOriginalSize = compressionStats.totalOriginalSize;
    compressionStats.totalCompressedSize = compressionStats.totalCompressedSize;

    return NextResponse.json({
      session: {
        id: session.id,
        exam_id: session.exam_id,
        student_id: session.student_id,
        submitted_at: session.submitted_at,
        used_clarifications: session.used_clarifications,
        created_at: session.created_at,
        // Decompressed session data
        decompressed: decompressedSessionData,
        // Compression metadata
        compression_metadata: session.compression_metadata,
        // Exam info
        exam: session.exams,
      },
      submissions: decompressedSubmissions,
      messages: decompressedMessages,
      compressionStats,
    });
  } catch (error) {
    console.error("Get session error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
