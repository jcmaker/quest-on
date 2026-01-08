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

    // ✅ 필터링 로직 개선: 같은 시험에 제출된 세션이 있으면 미제출 세션 제외
    // 1. 먼저 제출된 세션이 있는 시험 ID 수집
    const examsWithSubmittedSessions = new Set<string>();
    const submittedSessions: typeof allSessions = [];

    for (const session of allSessions) {
      if (session.submitted_at) {
        // 제출된 세션: 모두 보관하고, 해당 시험 ID 기록
        submittedSessions.push(session);
        examsWithSubmittedSessions.add(session.exam_id);
      }
    }

    // 2. 미제출 세션 중에서 제출된 세션이 없는 시험의 세션만 유지
    const examSessionMap = new Map<string, (typeof allSessions)[0]>();
    for (const session of allSessions) {
      if (!session.submitted_at) {
        const examId = session.exam_id;
        
        // ✅ 같은 시험에 제출된 세션이 있으면 미제출 세션 무시
        if (examsWithSubmittedSessions.has(examId)) {
          continue; // 제출된 세션이 있는 시험이면 미제출 세션 건너뛰기
        }
        
        // 제출된 세션이 없는 시험의 미제출 세션만 유지 (시험당 최신 1개)
        if (!examSessionMap.has(examId)) {
          examSessionMap.set(examId, session);
        }
      }
    }

    // 3. 결합: 미제출 세션(제출된 세션이 없는 시험만) + 모든 제출된 세션
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

    // Optimized: Batch fetch all submissions and grades at once
    const sessionIds = sessions.map((s) => s.id);

    // Fetch all submissions for all sessions in one query
    const { data: allSubmissions, error: submissionsError } = await supabase
      .from("submissions")
      .select("id, session_id, q_idx")
      .in("session_id", sessionIds);

    if (submissionsError) {
      console.error("Error fetching submissions:", submissionsError);
    }

    // Fetch all grades for all sessions in one query
    const { data: allGrades, error: gradesError } = await supabase
      .from("grades")
      .select("session_id, score")
      .in("session_id", sessionIds);

    if (gradesError) {
      console.error("Error fetching grades:", gradesError);
    }

    // Create maps for O(1) lookups
    const submissionsBySession = new Map<string, typeof allSubmissions>();
    if (allSubmissions) {
      for (const submission of allSubmissions) {
        if (!submissionsBySession.has(submission.session_id)) {
          submissionsBySession.set(submission.session_id, []);
        }
        submissionsBySession.get(submission.session_id)!.push(submission);
      }
    }

    const gradesBySession = new Map<string, typeof allGrades>();
    if (allGrades) {
      for (const grade of allGrades) {
        if (!gradesBySession.has(grade.session_id)) {
          gradesBySession.set(grade.session_id, []);
        }
        gradesBySession.get(grade.session_id)!.push(grade);
      }
    }

    // Process sessions with pre-fetched data
    const sessionsWithDetails = sessions.map((session) => {
      const exam = examMap.get(session.exam_id);
      const submissions = submissionsBySession.get(session.id) || [];
      const grades = gradesBySession.get(session.id) || [];

      // Calculate score - each grade is 0-100, calculate average
      let totalScore = null;
      let maxScore = null;
      let averageScore = null;
      const isGraded = grades.length > 0;

      if (isGraded) {
        const totalPoints = grades.reduce(
          (sum, grade) => sum + (grade.score || 0),
          0
        );
        averageScore = Math.round(totalPoints / grades.length);
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
        submissionCount: submissions.length,
        score: totalScore,
        maxScore: maxScore,
        averageScore: averageScore,
        isGraded: isGraded,
      };
    });

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
