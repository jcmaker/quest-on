import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ITEMS_PER_PAGE = 10;

export async function GET(request: NextRequest) {
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

    // Get pagination parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(
      searchParams.get("limit") || String(ITEMS_PER_PAGE),
      10
    );
    const offset = (page - 1) * limit;

    // Note: We'll calculate total count after filtering duplicates
    // This is more accurate than counting all sessions

    // Get all sessions for this student (we need to filter duplicates before pagination)
    const { data: allSessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, exam_id, submitted_at, created_at")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false });

    if (sessionsError) {
      console.error("Error fetching student sessions:", sessionsError);
      throw sessionsError;
    }

    if (!allSessions || allSessions.length === 0) {
      return NextResponse.json({
        sessions: [],
        pagination: {
          page,
          limit,
          total: 0,
          hasMore: false,
        },
      });
    }

    // Filter: For each exam, keep only the most recent unsubmitted session
    // Submitted sessions are kept separately (they represent past attempts)
    const examSessionMap = new Map<string, (typeof allSessions)[0]>();
    const submittedSessions: typeof allSessions = [];

    for (const session of allSessions) {
      if (session.submitted_at) {
        // Submitted sessions: keep all (they are historical records)
        submittedSessions.push(session);
      } else {
        // Unsubmitted sessions: keep only the most recent one per exam
        const examId = session.exam_id;
        // Since sessions are already sorted by created_at desc, first one is most recent
        if (!examSessionMap.has(examId)) {
          examSessionMap.set(examId, session);
        }
      }
    }

    // Combine: unsubmitted (one per exam) + all submitted sessions
    const unsubmittedSessions = Array.from(examSessionMap.values());
    const filteredSessions = [
      ...unsubmittedSessions,
      ...submittedSessions,
    ].sort((a, b) => {
      // Sort by created_at desc (most recent first)
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });

    // Apply pagination after filtering
    const sessions = filteredSessions.slice(offset, offset + limit);
    const filteredTotalCount = filteredSessions.length;

    // Collect all unique exam_ids
    const examIds = [...new Set(sessions.map((s) => s.exam_id))];

    // Fetch all exams in one query
    const { data: exams, error: examsError } = await supabase
      .from("exams")
      .select("id, title, code, duration, instructor_id")
      .in("id", examIds);

    if (examsError) {
      console.error("Error fetching exams:", examsError);
      throw examsError;
    }

    // Create a map of exam_id -> exam for quick lookup
    const examMap = new Map((exams || []).map((exam) => [exam.id, exam]));

    // Get submission counts and scores for each session
    const sessionsWithDetails = await Promise.all(
      sessions.map(async (session) => {
        const exam = examMap.get(session.exam_id);
        // Get submissions count
        const { data: submissions, error: submissionsError } = await supabase
          .from("submissions")
          .select("id, q_idx")
          .eq("session_id", session.id);

        if (submissionsError) {
          console.error("Error fetching submissions:", submissionsError);
        }

        // Get grades if available (from instructor)
        const { data: grades, error: gradesError } = await supabase
          .from("grades")
          .select("score")
          .eq("session_id", session.id);

        if (gradesError) {
          console.error("Error fetching grades:", gradesError);
        }

        // Calculate score - each grade is 0-100, calculate average
        // For display: show total points out of (num_grades * 100)
        let totalScore = null;
        let maxScore = null;
        let averageScore = null;
        const isGraded = grades && grades.length > 0;

        if (isGraded) {
          const totalPoints = grades.reduce(
            (sum, grade) => sum + (grade.score || 0),
            0
          );
          averageScore = Math.round(totalPoints / grades.length);
          // For consistent display, show total points / max points
          totalScore = totalPoints;
          maxScore = grades.length * 100; // Each question is scored 0-100
        }

        return {
          id: session.id,
          examId: session.exam_id,
          examTitle: exam?.title || "알 수 없는 시험",
          examCode: exam?.code || "",
          duration: exam?.duration || 0,
          status: session.submitted_at ? "completed" : "in-progress",
          submittedAt: session.submitted_at || null,
          createdAt: session.created_at,
          submissionCount: submissions?.length || 0,
          score: totalScore,
          maxScore: maxScore,
          averageScore: averageScore, // Average percentage across all graded questions
          isGraded: isGraded, // Whether instructor has graded this session
        };
      })
    );

    const hasMore = filteredTotalCount
      ? offset + limit < filteredTotalCount
      : false;

    return NextResponse.json({
      sessions: sessionsWithDetails,
      pagination: {
        page,
        limit,
        total: filteredTotalCount,
        hasMore,
      },
    });
  } catch (error) {
    console.error("Get student sessions error:", error);
    return NextResponse.json(
      { error: "Failed to get student sessions" },
      { status: 500 }
    );
  }
}
