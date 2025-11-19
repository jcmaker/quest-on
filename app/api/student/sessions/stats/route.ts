import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is student
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "student") {
      return NextResponse.json(
        { error: "Student access required" },
        { status: 403 }
      );
    }

    // Get all sessions for this student (for stats only, no pagination)
    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, submitted_at")
      .eq("student_id", user.id);

    if (sessionsError) {
      console.error("Error fetching student sessions:", sessionsError);
      throw sessionsError;
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({
        totalSessions: 0,
        completedSessions: 0,
        inProgressSessions: 0,
        overallAverageScore: null,
      });
    }

    const completedSessions = sessions.filter((s) => s.submitted_at !== null);
    const inProgressSessions = sessions.filter((s) => s.submitted_at === null);

    // Get all grades for completed sessions to calculate overall average
    const sessionIds = completedSessions.map((s) => s.id);
    
    if (sessionIds.length === 0) {
      return NextResponse.json({
        totalSessions: sessions.length,
        completedSessions: completedSessions.length,
        inProgressSessions: inProgressSessions.length,
        overallAverageScore: null,
      });
    }

    const { data: allGrades, error: gradesError } = await supabase
      .from("grades")
      .select("session_id, score")
      .in("session_id", sessionIds);

    if (gradesError) {
      console.error("Error fetching grades:", gradesError);
    }

    // Calculate overall average score
    let overallAverageScore: number | null = null;
    if (allGrades && allGrades.length > 0) {
      // Group grades by session_id
      const gradesBySession = new Map<string, number[]>();
      allGrades.forEach((grade) => {
        if (!gradesBySession.has(grade.session_id)) {
          gradesBySession.set(grade.session_id, []);
        }
        gradesBySession.get(grade.session_id)!.push(grade.score);
      });

      // Calculate average for each session, then overall average
      const sessionAverages: number[] = [];
      gradesBySession.forEach((scores) => {
        const sessionAvg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        sessionAverages.push(sessionAvg);
      });

      if (sessionAverages.length > 0) {
        overallAverageScore = Math.round(
          sessionAverages.reduce((sum, avg) => sum + avg, 0) / sessionAverages.length
        );
      }
    }

    return NextResponse.json({
      totalSessions: sessions.length,
      completedSessions: completedSessions.length,
      inProgressSessions: inProgressSessions.length,
      overallAverageScore,
    });
  } catch (error) {
    console.error("Get student stats error:", error);
    return NextResponse.json(
      { error: "Failed to get student stats" },
      { status: 500 }
    );
  }
}

