/**
 * 특정 학생의 시험 세션 삭제 스크립트
 * 
 * 사용법:
 *   npx tsx scripts/delete-student-sessions.ts P5AD7X user_31DCLDWlkhYzn2wYWSA03lWw12P
 * 
 * 또는 시험 코드와 학생 이름으로:
 *   npx tsx scripts/delete-student-sessions.ts P5AD7X 조준형
 */

import { prisma } from "../lib/prisma";

const EXAM_CODE = process.argv[2];
const STUDENT_IDENTIFIER = process.argv[3]; // student_id 또는 학생 이름

if (!EXAM_CODE || !STUDENT_IDENTIFIER) {
  console.error("❌ 사용법: npx tsx scripts/delete-student-sessions.ts [시험코드] [학생ID 또는 이름]");
  process.exit(1);
}

async function deleteStudentSessions(examCode: string, studentIdentifier: string) {
  try {
    console.log(`\n🔍 시험 코드 "${examCode}"에서 학생 세션 조회 중...\n`);

    // 1. 시험 찾기
    const exam = await prisma.exams.findUnique({
      where: { code: examCode },
      select: { id: true, title: true, code: true },
    });

    if (!exam) {
      console.error(`❌ 시험을 찾을 수 없습니다: ${examCode}`);
      process.exit(1);
    }

    console.log(`📝 시험: ${exam.title} (${exam.code})\n`);

    // 2. 학생 ID 찾기 (이름으로 검색하는 경우)
    let studentId: string;
    let studentName: string;

    if (studentIdentifier.startsWith("user_")) {
      // student_id로 직접 제공된 경우
      studentId = studentIdentifier;
      const profile = await prisma.student_profiles.findUnique({
        where: { student_id: studentId },
        select: { name: true },
      });
      studentName = profile?.name || studentId;
    } else {
      // 이름으로 검색
      const profile = await prisma.student_profiles.findFirst({
        where: { name: { contains: studentIdentifier } },
        select: { student_id: true, name: true },
      });

      if (!profile) {
        console.error(`❌ 학생을 찾을 수 없습니다: ${studentIdentifier}`);
        process.exit(1);
      }

      studentId = profile.student_id;
      studentName = profile.name;
    }

    console.log(`👤 학생: ${studentName} (${studentId})\n`);

    // 3. 해당 학생의 모든 세션 조회
    const sessions = await prisma.sessions.findMany({
      where: {
        exam_id: exam.id,
        student_id: studentId,
      },
      select: {
        id: true,
        created_at: true,
        submitted_at: true,
        used_clarifications: true,
        _count: {
          select: {
            messages: true,
            submissions: true,
            grades: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    if (sessions.length === 0) {
      console.log("✅ 삭제할 세션이 없습니다.\n");
      await prisma.$disconnect();
      return;
    }

    console.log(`📊 발견된 세션: ${sessions.length}개\n`);

    sessions.forEach((session, index) => {
      console.log(`${index + 1}. 세션 ID: ${session.id}`);
      console.log(`   생성일: ${session.created_at.toLocaleString("ko-KR")}`);
      console.log(
        `   제출일: ${session.submitted_at?.toLocaleString("ko-KR") || "미제출"}`
      );
      console.log(`   힌트 사용: ${session.used_clarifications}회`);
      console.log(
        `   메시지: ${session._count.messages}개, 제출물: ${session._count.submissions}개, 점수: ${session._count.grades}개`
      );
      console.log();
    });

    // 4. 확인
    console.log("⚠️  다음 데이터가 삭제됩니다:");
    const totalMessages = sessions.reduce(
      (sum, s) => sum + s._count.messages,
      0
    );
    const totalSubmissions = sessions.reduce(
      (sum, s) => sum + s._count.submissions,
      0
    );
    const totalGrades = sessions.reduce((sum, s) => sum + s._count.grades, 0);

    console.log(`   - 세션: ${sessions.length}개`);
    console.log(`   - 메시지: ${totalMessages}개`);
    console.log(`   - 제출물: ${totalSubmissions}개`);
    console.log(`   - 점수: ${totalGrades}개\n`);

    // 5. 세션이 2개인 이유 분석
    if (sessions.length > 1) {
      console.log("🔍 세션이 여러 개인 이유 분석:\n");
      const submitted = sessions.filter((s) => s.submitted_at);
      const inProgress = sessions.filter((s) => !s.submitted_at);

      if (submitted.length > 0) {
        console.log(`   - 제출 완료된 세션: ${submitted.length}개`);
        submitted.forEach((s) => {
          console.log(
            `     * ${s.id.slice(0, 8)}... (${s.submitted_at?.toLocaleString("ko-KR")})`
          );
        });
      }

      if (inProgress.length > 0) {
        console.log(`   - 진행 중인 세션: ${inProgress.length}개`);
        inProgress.forEach((s) => {
          console.log(
            `     * ${s.id.slice(0, 8)}... (${s.created_at.toLocaleString("ko-KR")})`
          );
        });
      }

      console.log(
        "\n   💡 원인: 같은 학생이 여러 번 시험을 시작했거나, 다른 기기/탭에서 접속했을 가능성이 있습니다.\n"
      );
    }

    // 6. 삭제 실행
    const sessionIds = sessions.map((s) => s.id);

    console.log("🗑️  삭제 중...\n");

    // Prisma의 cascade delete를 활용 (관계된 데이터 자동 삭제)
    // 하지만 명시적으로 삭제하는 것이 더 안전
    await prisma.$transaction(async (tx) => {
      // 1. 메시지 삭제
      await tx.messages.deleteMany({
        where: { session_id: { in: sessionIds } },
      });

      // 2. 제출물 삭제
      await tx.submissions.deleteMany({
        where: { session_id: { in: sessionIds } },
      });

      // 3. 점수 삭제
      await tx.grades.deleteMany({
        where: { session_id: { in: sessionIds } },
      });

      // 4. 세션 삭제
      await tx.sessions.deleteMany({
        where: { id: { in: sessionIds } },
      });
    });

    console.log("✅ 삭제 완료!\n");
    console.log(`   - ${sessions.length}개 세션 삭제됨`);
    console.log(`   - ${totalMessages}개 메시지 삭제됨`);
    console.log(`   - ${totalSubmissions}개 제출물 삭제됨`);
    console.log(`   - ${totalGrades}개 점수 삭제됨\n`);

    // 7. 확인: 남은 세션 수
    const remainingSessions = await prisma.sessions.count({
      where: {
        exam_id: exam.id,
        student_id: studentId,
      },
    });

    if (remainingSessions === 0) {
      console.log("✅ 해당 학생의 모든 세션이 삭제되었습니다.\n");
    } else {
      console.log(
        `⚠️  예상치 못한 세션이 ${remainingSessions}개 남아있습니다.\n`
      );
    }
  } catch (error) {
    console.error("❌ 오류 발생:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 스크립트 실행
deleteStudentSessions(EXAM_CODE, STUDENT_IDENTIFIER);

