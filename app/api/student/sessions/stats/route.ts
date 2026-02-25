import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@clerk/nextjs/server";
import { successJson, errorJson } from "@/lib/api-response";

// Initialize Supabase client
const supabase = getSupabaseServer();

export async function GET() {
  try {
    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is student
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "student") {
      return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
    }

    // Get all sessions for this student (for stats only, no pagination)
    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, submitted_at")
      .eq("student_id", user.id);

    if (sessionsError) {
      throw sessionsError;
    }

    if (!sessions || sessions.length === 0) {
      return successJson({
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
      return successJson({
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
      // Non-critical: grades fetch failed
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

    return successJson({
      totalSessions: sessions.length,
      completedSessions: completedSessions.length,
      inProgressSessions: inProgressSessions.length,
      overallAverageScore,
    });
  } catch (error) {
    return errorJson("FETCH_STATS_FAILED", "Failed to get student stats", 500);
  }
}

