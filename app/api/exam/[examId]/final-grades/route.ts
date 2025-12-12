import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server";

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
      .select("instructor_id")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    if (exam.instructor_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get all sessions for this exam
    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id")
      .eq("exam_id", examId);

    if (sessionsError) {
      console.error("Error fetching sessions:", sessionsError);
      return NextResponse.json(
        { error: "Failed to fetch sessions" },
        { status: 500 }
      );
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ grades: [] });
    }

    // Get all grades for these sessions
    // 교수가 수동으로 채점한 점수만 가져오기 (자동 채점 제외)
    const sessionIds = sessions.map((s) => s.id);
    const { data: grades, error: gradesError } = await supabase
      .from("grades")
      .select("session_id, score, q_idx, created_at, comment")
      .in("session_id", sessionIds);

    if (gradesError) {
      console.error("Error fetching grades:", gradesError);
      return NextResponse.json(
        { error: "Failed to fetch grades" },
        { status: 500 }
      );
    }

    if (!grades || grades.length === 0) {
      return NextResponse.json({ grades: [] });
    }

    // 교수가 수동으로 채점한 점수만 필터링
    // 자동 채점과 수동 채점을 구분하는 방법:
    // 1. 자동 채점: PUT /api/session/[sessionId]/grade (auto-grade)로 생성
    //    - comment가 특정 형식이거나 없음
    //    - stage_grading이 있음
    // 2. 교수가 수동으로 채점: POST /api/session/[sessionId]/grade로 저장
    //    - 교수가 채점 페이지에서 점수를 저장한 경우
    //    - comment가 있고 특정 형식이 아님
    //
    // 구분 방법:
    // - 자동 채점의 comment는 보통 "채팅 단계: X점, 답안 단계: Y점..." 형식
    // - 교수가 수동으로 저장한 경우는 다른 형식의 comment이거나 없을 수 있음
    // - 일단은 자동 채점 comment 패턴을 확인하여 필터링

    // 자동 채점 comment 패턴: "채팅 단계:", "답안 단계:", "피드백 단계:" 포함
    const autoGradePattern = /(채팅 단계|답안 단계|피드백 단계)/;

    // 세션별로 grades 그룹화
    const gradesBySession = new Map<string, typeof grades>();
    grades.forEach((grade) => {
      if (!gradesBySession.has(grade.session_id)) {
        gradesBySession.set(grade.session_id, []);
      }
      gradesBySession.get(grade.session_id)?.push(grade);
    });

    // 교수가 수동으로 채점한 세션만 필터링
    const finalGrades: Array<{ session_id: string; score: number }> = [];

    gradesBySession.forEach((sessionGrades, sessionId) => {
      // 세션의 모든 grades가 자동 채점 패턴이 아닌 경우만 최종 채점으로 간주
      const hasManualGrade = sessionGrades.some((grade) => {
        // comment가 없거나 자동 채점 패턴이 아니면 수동 채점으로 간주
        if (!grade.comment) return true; // comment가 없으면 수동 채점 가능성
        return !autoGradePattern.test(grade.comment);
      });

      if (hasManualGrade) {
        // 평균 점수 계산
        const averageScore =
          sessionGrades.length > 0
            ? Math.round(
                sessionGrades.reduce((sum, g) => sum + g.score, 0) /
                  sessionGrades.length
              )
            : 0;
        finalGrades.push({
          session_id: sessionId,
          score: averageScore,
        });
      }
    });

    return NextResponse.json({ grades: finalGrades });
  } catch (error) {
    console.error("Final grades API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
