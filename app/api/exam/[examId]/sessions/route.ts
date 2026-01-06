import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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
      name =
        user.emailAddresses[0]?.emailAddress ||
        `Student ${clerkUserId.slice(0, 8)}`;
    }

    const email =
      user.emailAddresses[0]?.emailAddress || `${clerkUserId}@example.com`;

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

    let user;
    try {
      user = await currentUser();
    } catch (clerkError) {
      console.error(
        `❌ [AUTH] Clerk API error | Exam: ${examId}`,
        clerkError
      );
      return NextResponse.json(
        { error: "Authentication service error" },
        { status: 500 }
      );
    }

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
        created_at
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

    // Fetch student info for all students in parallel (for email)
    const studentInfoMap = new Map<
      string,
      { name: string; email: string; student_number?: string; school?: string }
    >();
    await Promise.all(
      uniqueStudentIds.map(async (studentId) => {
        const info = await getUserInfo(studentId);
        const profile = studentProfileMap.get(studentId);

        if (info) {
          studentInfoMap.set(studentId, {
            name: profile?.name || info.name,
            email: info.email,
            student_number: profile?.student_number,
            school: profile?.school,
          });
        }
      })
    );

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
      };
    });

    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Exam sessions GET completed in ${requestDuration}ms`
    );
    console.log(
      `✅ [SUCCESS] Exam sessions retrieved | Exam: ${exam.id} | Sessions: ${sessions.length}`
    );

    return NextResponse.json({
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
