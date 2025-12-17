/**
 * 중앙화된 Query Key 관리
 *
 * 사용 예시:
 * - useQuery({ queryKey: qk.instructor.exams(userId), ... })
 * - queryClient.invalidateQueries({ queryKey: qk.instructor.exams() })
 */

export const qk = {
  instructor: {
    /**
     * 강사가 생성한 시험 목록
     * @param userId - 강사 사용자 ID (optional, 부분 매칭 가능)
     */
    exams: (userId?: string) => {
      if (userId) {
        return ["instructor-exams", userId] as const;
      }
      return ["instructor-exams"] as const;
    },

    /**
     * 시험별 분석 데이터
     * @param examId - 시험 ID
     */
    examAnalytics: (examId: string) => ["exam-analytics", examId] as const,
  },

  student: {
    /**
     * 학생의 시험 세션 목록 (무한 스크롤)
     * @param userId - 학생 사용자 ID (optional, 부분 매칭 가능)
     */
    sessions: (userId?: string) => {
      if (userId) {
        return ["student-sessions", userId] as const;
      }
      return ["student-sessions"] as const;
    },

    /**
     * 학생의 통계 데이터
     * @param userId - 학생 사용자 ID (optional, 부분 매칭 가능)
     */
    stats: (userId?: string) => {
      if (userId) {
        return ["student-stats", userId] as const;
      }
      return ["student-stats"] as const;
    },
  },

  session: {
    /**
     * 세션별 채점 데이터
     * @param sessionId - 세션 ID (studentId로 사용됨)
     */
    grade: (sessionId: string) => ["session-grade", sessionId] as const,

    /**
     * 세션별 AI 요약 데이터
     * @param sessionId - 세션 ID (optional)
     */
    summary: (sessionId?: string) => {
      if (sessionId) {
        return ["session-summary", sessionId] as const;
      }
      return ["session-summary"] as const;
    },
  },

  drive: {
    /**
     * 드라이브 폴더 내용
     * @param folderId - 폴더 ID (null이면 루트)
     * @param userId - 사용자 ID (optional, 부분 매칭 가능)
     */
    folderContents: (folderId: string | null, userId?: string) => {
      if (userId) {
        return ["drive-folder-contents", folderId, userId] as const;
      }
      return ["drive-folder-contents", folderId] as const;
    },

    /**
     * 드라이브 브레드크럼
     * @param folderId - 폴더 ID
     */
    breadcrumb: (folderId: string) => ["drive-breadcrumb", folderId] as const,
  },
} as const;
