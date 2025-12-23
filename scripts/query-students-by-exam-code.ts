/**
 * 시험 코드로 해당 시험을 본 학생 목록 조회 스크립트
 * 
 * 사용법:
 *   npx tsx scripts/query-students-by-exam-code.ts P5AD7X
 * 
 * 또는 직접 실행:
 *   npx tsx scripts/query-students-by-exam-code.ts
 */

import { prisma } from "../lib/prisma";

const EXAM_CODE = process.argv[2] || "P5AD7X";

async function queryStudentsByExamCode(examCode: string) {
  try {
    console.log(`\n🔍 시험 코드 "${examCode}"를 조회 중...\n`);

    // 1. 시험 정보 조회
    const exam = await prisma.exams.findUnique({
      where: { code: examCode },
      select: {
        id: true,
        title: true,
        code: true,
        description: true,
        duration: true,
        created_at: true,
      },
    });

    if (!exam) {
      console.error(`❌ 시험을 찾을 수 없습니다: ${examCode}`);
      process.exit(1);
    }

    console.log(`📝 시험 정보:`);
    console.log(`   제목: ${exam.title}`);
    console.log(`   코드: ${exam.code}`);
    console.log(`   설명: ${exam.description || "없음"}`);
    console.log(`   시간: ${exam.duration}분`);
    console.log(`   생성일: ${exam.created_at?.toLocaleString("ko-KR")}\n`);

    // 2. 해당 시험의 모든 세션 조회
    const sessions = await prisma.sessions.findMany({
      where: { exam_id: exam.id },
      select: {
        id: true,
        student_id: true,
        created_at: true,
        submitted_at: true,
        used_clarifications: true,
      },
      orderBy: { created_at: "desc" },
    });

    console.log(`📊 세션 통계:`);
    console.log(`   총 세션 수: ${sessions.length}개`);
    console.log(
      `   제출 완료: ${sessions.filter((s) => s.submitted_at).length}개`
    );
    console.log(
      `   진행 중: ${sessions.filter((s) => !s.submitted_at).length}개\n`
    );

    // 3. 고유한 학생 ID 추출
    const uniqueStudentIds = [...new Set(sessions.map((s) => s.student_id))];
    console.log(`👥 고유 학생 수: ${uniqueStudentIds.length}명\n`);

    // 4. 학생 프로필 정보 조회
    const studentProfiles = await prisma.student_profiles.findMany({
      where: { student_id: { in: uniqueStudentIds } },
      select: {
        student_id: true,
        name: true,
        student_number: true,
        school: true,
      },
    });

    // 학생 ID -> 프로필 매핑
    const profileMap = new Map(
      studentProfiles.map((p) => [p.student_id, p])
    );

    // 5. 학생별 세션 통계 계산
    const studentStats = uniqueStudentIds.map((studentId) => {
      const studentSessions = sessions.filter(
        (s) => s.student_id === studentId
      );
      const profile = profileMap.get(studentId);

      return {
        student_id: studentId,
        name: profile?.name || `Student ${studentId.slice(0, 8)}`,
        student_number: profile?.student_number || "없음",
        school: profile?.school || "없음",
        session_count: studentSessions.length,
        first_attempt: studentSessions[studentSessions.length - 1]?.created_at,
        last_submitted: studentSessions
          .filter((s) => s.submitted_at)
          .sort(
            (a, b) =>
              (b.submitted_at?.getTime() || 0) -
              (a.submitted_at?.getTime() || 0)
          )[0]?.submitted_at,
        max_clarifications: Math.max(
          ...studentSessions.map((s) => s.used_clarifications),
          0
        ),
        submitted_count: studentSessions.filter((s) => s.submitted_at).length,
      };
    });

    // 6. 결과 출력
    console.log("=".repeat(80));
    console.log("👥 학생 목록:");
    console.log("=".repeat(80));

    studentStats
      .sort((a, b) => {
        // 제출일 기준 내림차순 정렬
        const dateA = a.last_submitted?.getTime() || 0;
        const dateB = b.last_submitted?.getTime() || 0;
        if (dateA !== dateB) return dateB - dateA;
        // 제출일이 같으면 첫 시도일 기준
        return (
          (b.first_attempt?.getTime() || 0) -
          (a.first_attempt?.getTime() || 0)
        );
      })
      .forEach((stat, index) => {
        console.log(`\n${index + 1}. ${stat.name}`);
        console.log(`   학번: ${stat.student_number}`);
        console.log(`   학교: ${stat.school}`);
        console.log(`   학생 ID: ${stat.student_id}`);
        console.log(`   세션 수: ${stat.session_count}개`);
        console.log(
          `   제출 완료: ${stat.submitted_count}개 / ${stat.session_count}개`
        );
        console.log(
          `   첫 시도: ${stat.first_attempt?.toLocaleString("ko-KR") || "없음"}`
        );
        console.log(
          `   마지막 제출: ${stat.last_submitted?.toLocaleString("ko-KR") || "없음"}`
        );
        console.log(`   최대 힌트 사용: ${stat.max_clarifications}회`);
      });

    console.log("\n" + "=".repeat(80));
    console.log(`\n✅ 총 ${uniqueStudentIds.length}명의 학생이 이 시험을 시도했습니다.\n`);

    // 7. 요약 통계
    const avgClarifications =
      sessions.reduce((sum, s) => sum + s.used_clarifications, 0) /
      sessions.length;
    const maxClarifications = Math.max(
      ...sessions.map((s) => s.used_clarifications),
      0
    );

    console.log("📈 요약 통계:");
    console.log(`   평균 힌트 사용: ${avgClarifications.toFixed(2)}회`);
    console.log(`   최대 힌트 사용: ${maxClarifications}회`);
    console.log(
      `   제출률: ${((sessions.filter((s) => s.submitted_at).length / sessions.length) * 100).toFixed(1)}%\n`
    );
  } catch (error) {
    console.error("❌ 오류 발생:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 스크립트 실행
queryStudentsByExamCode(EXAM_CODE);

