import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@clerk/nextjs/server";
import { createClerkClient } from "@clerk/nextjs/server";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Clerk client
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

// Helper function to get user info from Clerk
async function getUserInfo(clerkUserId: string): Promise<{
  name: string;
  email: string;
} | null> {
  try {
    const user = await clerk.users.getUser(clerkUserId);
    
    // Get user name from firstName/lastName or fullName
    let name = "";
    if (user.firstName && user.lastName) {
      name = `${user.firstName} ${user.lastName}`;
    } else if (user.firstName) {
      name = user.firstName;
    } else if (user.lastName) {
      name = user.lastName;
    } else if (user.fullName) {
      name = user.fullName;
    } else {
      // Fallback to email or ID
      name = user.emailAddresses[0]?.emailAddress || `Student ${clerkUserId.slice(0, 8)}`;
    }
    
    const email = user.emailAddresses[0]?.emailAddress || `${clerkUserId}@example.com`;
    
    return {
      name,
      email,
    };
  } catch (error) {
    console.error("Error fetching user info from Clerk:", error);
    // Fallback to placeholder
    return {
      name: `Student ${clerkUserId.slice(0, 8)}`,
      email: `${clerkUserId}@example.com`,
    };
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const requestStartTime = Date.now();
  try {
    const { examId } = await params;
    console.log(`📊 [EXAM_SESSIONS] Request received | Exam: ${examId}`);

    const user = await currentUser();

    if (!user) {
      console.error(
        `❌ [AUTH] Unauthorized exam sessions access | Exam: ${examId}`
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      console.error(
        `❌ [AUTH] Non-instructor access attempt | User: ${user.id} | Exam: ${examId}`
      );
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.log(
      `✅ [AUTH] Instructor authenticated | User: ${user.id} | Exam: ${examId}`
    );

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

    // Get unique student IDs
    const uniqueStudentIds = [...new Set(sessions.map((s) => s.student_id))];
    
    // Fetch student info for all students in parallel
    const studentInfoMap = new Map<string, { name: string; email: string }>();
    await Promise.all(
      uniqueStudentIds.map(async (studentId) => {
        const info = await getUserInfo(studentId);
        if (info) {
          studentInfoMap.set(studentId, info);
        }
      })
    );

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

          if (
            submission.compressed_answer_data &&
            typeof submission.compressed_answer_data === "string"
          ) {
            try {
              decompressedAnswerData = decompressData(
                submission.compressed_answer_data
              );
            } catch (error) {
              console.error("Error decompressing answer data:", error);
            }
          }

          if (
            submission.compressed_feedback_data &&
            typeof submission.compressed_feedback_data === "string"
          ) {
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

          if (
            message.compressed_content &&
            typeof message.compressed_content === "string"
          ) {
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

      sessionCompressionStats.submissions.forEach((meta) => {
        const metaObj = meta as Record<string, unknown>;
        sessionCompressionStats.totalOriginalSize +=
          (metaObj.originalSize as number) || 0;
        sessionCompressionStats.totalCompressedSize +=
          (metaObj.compressedSize as number) || 0;
      });

      sessionCompressionStats.messages.forEach((meta) => {
        const metaObj = meta as Record<string, unknown>;
        sessionCompressionStats.totalOriginalSize +=
          (metaObj.originalSize as number) || 0;
        sessionCompressionStats.totalCompressedSize +=
          (metaObj.compressedSize as number) || 0;
      });

      // Get student info from map
      const studentInfo = studentInfoMap.get(session.student_id) || {
        name: `Student ${session.student_id.slice(0, 8)}`,
        email: `${session.student_id}@example.com`,
      };

      return {
        id: session.id,
        student_id: session.student_id,
        student_name: studentInfo.name,
        student_email: studentInfo.email,
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

    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Exam sessions GET completed in ${requestDuration}ms`
    );
    console.log(
      `✅ [SUCCESS] Exam sessions retrieved | Exam: ${exam.id} | Sessions: ${
        sessions.length
      } | Total space saved: ${(
        overallCompressionStats.totalSpaceSaved / 1024
      ).toFixed(2)}KB`
    );

    return NextResponse.json({
      exam: {
        id: exam.id,
        title: exam.title,
      },
      sessions: processedSessions,
      compressionStats: overallCompressionStats,
    });
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    console.error("Get exam sessions error:", error);
    console.error(
      `❌ [ERROR] Exam sessions GET failed after ${requestDuration}ms | Error: ${
        (error as Error)?.message
      }`
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
