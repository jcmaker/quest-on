import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server";
import { successJson, errorJson } from "@/lib/api-response";
import { batchGetUserInfo } from "@/lib/clerk-users";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const requestStartTime = Date.now();
  try {
    const { examId } = await params;
    console.log(`📊 [EXAM_SESSIONS] Request received | Exam: ${examId}`);

    let user;
    try {
      user = await currentUser();
    } catch (clerkError) {
      console.error(
        `❌ [AUTH] Clerk API error | Exam: ${examId}`,
        clerkError
      );
      return errorJson("INTERNAL_ERROR", "Authentication service error", 500);
    }

    if (!user) {
      console.error(
        `❌ [AUTH] Unauthorized exam sessions access | Exam: ${examId}`
      );
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      console.error(
        `❌ [AUTH] Non-instructor access attempt | User: ${user.id} | Exam: ${examId}`
      );
      return errorJson("FORBIDDEN", "Forbidden", 403);
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
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Optimized: Only fetch minimal session data needed for student list
    // Don't fetch submissions/messages as they're not needed for the list view
    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select(
        `
        id,
        student_id,
        submitted_at,
        used_clarifications,
        created_at,
        status,
        is_active,
        last_heartbeat_at
      `
      )
      .eq("exam_id", examId)
      .order("submitted_at", { ascending: false });

    if (sessionsError) {
      throw sessionsError;
    }

    // Get unique student IDs
    const uniqueStudentIds = [...new Set(sessions.map((s) => s.student_id))];

    // Fetch student profiles from database
    const { data: studentProfiles } = await supabase
      .from("student_profiles")
      .select("student_id, name, student_number, school")
      .in("student_id", uniqueStudentIds);

    // Create a map of student profiles by student_id
    const studentProfileMap = new Map<
      string,
      { name: string; student_number: string; school: string }
    >();
    if (studentProfiles) {
      studentProfiles.forEach((profile) => {
        studentProfileMap.set(profile.student_id, {
          name: profile.name,
          student_number: profile.student_number,
          school: profile.school,
        });
      });
    }

    // Batch fetch all student info from Clerk (single API call)
    const clerkUserMap = await batchGetUserInfo(uniqueStudentIds);

    const studentInfoMap = new Map<
      string,
      { name: string; email: string; student_number?: string; school?: string }
    >();
    for (const studentId of uniqueStudentIds) {
      const info = clerkUserMap.get(studentId);
      const profile = studentProfileMap.get(studentId);

      if (info) {
        studentInfoMap.set(studentId, {
          name: profile?.name || info.name,
          email: info.email,
          student_number: profile?.student_number,
          school: profile?.school,
        });
      }
    }

    // Optimized: Process sessions without decompression (not needed for list view)
    const processedSessions = sessions.map((session) => {
      // Get student info from map
      const studentInfo = studentInfoMap.get(session.student_id) || {
        name: `Student ${session.student_id.slice(0, 8)}`,
        email: `${session.student_id}@example.com`,
        student_number: undefined,
        school: undefined,
      };

      return {
        id: session.id,
        student_id: session.student_id,
        student_name: studentInfo.name,
        student_email: studentInfo.email,
        student_number: studentInfo.student_number,
        student_school: studentInfo.school,
        submitted_at: session.submitted_at,
        used_clarifications: session.used_clarifications,
        created_at: session.created_at,
        status: session.status || (session.submitted_at ? "submitted" : "in_progress"),
        is_active: session.is_active ?? true,
        last_heartbeat_at: session.last_heartbeat_at,
      };
    });

    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Exam sessions GET completed in ${requestDuration}ms`
    );
    console.log(
      `✅ [SUCCESS] Exam sessions retrieved | Exam: ${exam.id} | Sessions: ${sessions.length}`
    );

    return successJson({
      exam: {
        id: exam.id,
        title: exam.title,
      },
      sessions: processedSessions,
    });
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    console.error("Get exam sessions error:", error);
    console.error(
      `❌ [ERROR] Exam sessions GET failed after ${requestDuration}ms | Error: ${
        (error as Error)?.message
      }`
    );
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
