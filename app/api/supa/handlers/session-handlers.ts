import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { compressData } from "@/lib/compression";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";

const supabase = getSupabaseServer();

export async function createOrGetSession(data: { examId: string; studentId: string }) {
  try {
    // Verify current user matches the studentId
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.id !== data.studentId) {
      return errorJson("UNAUTHORIZED", "Student ID mismatch", 403);
    }

    // Upsert session (race-safe: uses UNIQUE(exam_id, student_id) constraint)
    // Use ignoreDuplicates to avoid overwriting existing session data
    const { data: upsertedSession, error: upsertError } = await supabase
      .from("sessions")
      .upsert(
        {
          exam_id: data.examId,
          student_id: data.studentId,
          used_clarifications: 0,
          created_at: new Date().toISOString(),
        },
        { onConflict: "exam_id,student_id", ignoreDuplicates: true }
      )
      .select()
      .maybeSingle();

    if (upsertError) throw upsertError;

    // If ignoreDuplicates skipped the insert, fetch the existing session
    let session = upsertedSession;
    if (!session) {
      const { data: existing, error: fetchError } = await supabase
        .from("sessions")
        .select("*")
        .eq("exam_id", data.examId)
        .eq("student_id", data.studentId)
        .single();
      if (fetchError) throw fetchError;
      session = existing;
    }

    // Get existing messages for this session
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;

    // 프론트엔드가 기대하는 형식으로 변환 (qIdx 포함)
    const formattedMessages = (messages || []).map((msg) => ({
      type: msg.role === "user" ? "user" : "assistant",
      message: msg.content,
      timestamp: msg.created_at,
      qIdx: msg.q_idx || 0,
    }));

    return successJson({
      session,
      messages: formattedMessages,
    });
  } catch (error) {
    logError("[createOrGetSession] Failed to create or get session", error, { path: "/api/supa/session-handlers" });
    return errorJson("SESSION_FAILED", "Failed to create or get session", 500);
  }
}

// Optimized function to fetch exam AND session in one go
export async function initExamSession(data: {
  examCode: string;
  studentId: string;
  deviceFingerprint?: string;
}) {
  try {
    // Verify current user matches the studentId
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.id !== data.studentId) {
      return errorJson("UNAUTHORIZED", "Student ID mismatch", 403);
    }

    // 1. Fetch Exam by Code
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("code", data.examCode)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    // ✅ Gate 방식: 시험 상태 및 입장 가능 여부 확인
    const now = new Date().toISOString();
    const nowTime = new Date().getTime();
    const examStatus = exam.status || "draft";
    const openAt = exam.open_at ? new Date(exam.open_at).getTime() : null;
    const closeAt = exam.close_at ? new Date(exam.close_at).getTime() : null;
    const startedAt = exam.started_at ? new Date(exam.started_at).getTime() : null;

    // ✅ 기본 원칙: 시작 전(draft/joinable/scheduled)에는 Join만 가능, 응시는 불가
    // Running 상태에서만 실제 응시 가능

    // Closed 상태는 Join 불가
    if (examStatus === "closed" || examStatus === "archived") {
      return errorJson("EXAM_NOT_AVAILABLE", "Exam not available for joining", 403, { currentStatus: examStatus, message: "This exam is closed or archived" });
    }

    // Gate 필드가 있는 경우: close_at 체크 (입장 마감 시간)
    const hasGateFields = openAt !== null || closeAt !== null;
    if (hasGateFields) {
      const isEntryClosed = closeAt !== null && nowTime >= closeAt;
      if (isEntryClosed) {
        return errorJson("ENTRY_WINDOW_CLOSED", "Entry window closed", 403, { closeAt: exam.close_at, message: "The entry window for this exam has closed" });
      }
    }

    // core_ability(핵심 역량) 필드는 제거되었으므로, 세션 init 응답에서도 제거한다.
    if (exam.questions && Array.isArray(exam.questions)) {
      exam.questions = exam.questions.map((q: Record<string, unknown>) => {
        const { core_ability, ...rest } = q as Record<string, unknown> & {
          core_ability?: unknown;
        };
        return rest;
      });
    }

    // 2. Get all existing sessions (most recent first)
    const { data: existingSessions, error: checkError } = await supabase
      .from("sessions")
      .select("*")
      .eq("exam_id", exam.id)
      .eq("student_id", data.studentId)
      .order("created_at", { ascending: false });

    if (checkError) throw checkError;

    // ✅ 요구사항: 이미 제출된 세션이 있으면 재시험 불가
    const mostRecentSubmittedSession =
      (existingSessions || []).find((s) => !!s.submitted_at) || null;

    if (mostRecentSubmittedSession) {
      // 제출된 세션이 있으면 재시험 불가 - 제출된 세션만 반환

      // Get messages for submitted session (read-only)
      const { data: sessionMessages } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", mostRecentSubmittedSession.id)
        .order("created_at", { ascending: true });

      const messages = (sessionMessages || []).map((msg) => ({
        type: msg.role === "user" ? "user" : "assistant",
        message: msg.content,
        timestamp: msg.created_at,
        qIdx: msg.q_idx || 0,
      }));

      // Fetch submissions for the submitted session
      const { data: submittedSubmissions } = await supabase
        .from("submissions")
        .select("q_idx, answer")
        .eq("session_id", mostRecentSubmittedSession.id);

      return successJson({
        exam,
        session: mostRecentSubmittedSession,
        messages,
        submissions: submittedSubmissions || [],
        isRetakeBlocked: true, // 재시험 차단 플래그
      });
    }

    // 제출되지 않은 세션만 처리
    const unsubmittedSessions = (existingSessions || []).filter(
      (s) => !s.submitted_at
    );

    const incomingFingerprint = data.deviceFingerprint || null;

    const exactDeviceMatch =
      incomingFingerprint === null
        ? null
        : unsubmittedSessions.find(
            (s) => s.device_fingerprint === incomingFingerprint
          ) || null;

    // Legacy: device_fingerprint가 비어있는 예전 세션이 있으면, 첫 접속에서 "소유"하도록 할당
    const claimableLegacySession =
      incomingFingerprint === null
        ? null
        : unsubmittedSessions.find((s) => !s.device_fingerprint) || null;

    let existingSession: (typeof existingSessions)[0] | null =
      exactDeviceMatch || claimableLegacySession || null;

    let session = existingSession;
    let messages: Array<{
      type: "user" | "assistant";
      message: string;
      timestamp: string;
      qIdx: number;
    }> = [];

    if (existingSession && !existingSession.submitted_at) {
      // ✅ Gate 방식: 세션 상태 확인 및 타이머 계산
      const sessionStatus = existingSession.status || "not_joined";

      // ✅ 중요: 타이머는 in_progress 상태이고 attempt_timer_started_at이 설정된 경우에만 시작됨
      // waiting 상태에서는 타이머가 시작되지 않으므로 시간 체크를 하지 않음
      const timerStartTime = existingSession.attempt_timer_started_at
        ? new Date(existingSession.attempt_timer_started_at).getTime()
        : null;

      // ✅ 시험 시간 종료 체크는 in_progress 상태이고 타이머가 시작된 경우에만 수행
      if (sessionStatus === "in_progress" && timerStartTime !== null && exam.duration !== 0) {
        const examDurationMs = exam.duration * 60 * 1000; // 분을 밀리초로 변환
        const sessionEndTime = timerStartTime + examDurationMs;
        const timeRemaining = sessionEndTime - nowTime;

        // 시간 종료 체크 및 자동 제출 처리
        if (timeRemaining <= 0) {
        // 기존 답안 가져오기
        const { data: existingSubmissions } = await supabase
          .from("submissions")
          .select("*")
          .eq("session_id", existingSession.id);

        // 자동 제출 처리 (빈 답안이라도 제출)
        const { data: updatedSession, error: updateError } = await supabase
          .from("sessions")
          .update({
            submitted_at: now,
            is_active: false,
          })
          .eq("id", existingSession.id)
          .select()
          .single();

        if (updateError) throw updateError;
        session = updatedSession;

        // 메시지 로드
        const { data: sessionMessages } = await supabase
          .from("messages")
          .select("*")
          .eq("session_id", existingSession.id)
          .order("created_at", { ascending: true });

        messages = (sessionMessages || []).map((msg) => ({
          type: msg.role === "user" ? "user" : "assistant",
          message: msg.content,
          timestamp: msg.created_at,
          qIdx: msg.q_idx || 0,
        }));

        return successJson({
          exam,
          session,
          messages,
          submissions: existingSubmissions || [],
          autoSubmitted: true, // 자동 제출 플래그
          timeExpired: true,
        });
      }
      }

      // ✅ 세션 상태에 따라 처리: 기본적으로 시작 전에는 waiting, 시작 후에는 in_progress
      const currentStatus = existingSession.status || "not_joined";
      const examStarted = examStatus === "running" && startedAt !== null && nowTime >= startedAt;

      // 이미 InProgress인 경우 (시험이 시작된 경우)
      if (currentStatus === "in_progress") {
        const { data: updatedSession, error: updateError } = await supabase
          .from("sessions")
          .update({
            is_active: true,
            last_heartbeat_at: now,
            device_fingerprint:
              incomingFingerprint || existingSession.device_fingerprint || null,
          })
          .eq("id", existingSession.id)
          .select()
          .single();

        if (updateError) throw updateError;
        session = updatedSession;
      } else if (examStarted && currentStatus === "waiting") {
        // 시험이 시작되었고 세션이 waiting 상태인 경우 → in_progress로 전환
        const { data: updatedSession, error: updateError } = await supabase
          .from("sessions")
          .update({
            is_active: true,
            last_heartbeat_at: now,
            device_fingerprint:
              incomingFingerprint || existingSession.device_fingerprint || null,
            status: "in_progress",
            started_at: now,
            attempt_timer_started_at: now,
          })
          .eq("id", existingSession.id)
          .select()
          .single();

        if (updateError) throw updateError;
        session = updatedSession;
      } else {
        // Waiting 상태인 경우 (시험 시작 대기 중)
        const { data: updatedSession, error: updateError } = await supabase
          .from("sessions")
          .update({
            is_active: true,
            last_heartbeat_at: now,
            device_fingerprint:
              incomingFingerprint || existingSession.device_fingerprint || null,
            // 상태가 없거나 joined인 경우 waiting으로 설정
            status: currentStatus === "joined" || !currentStatus ? "waiting" : currentStatus,
          })
          .eq("id", existingSession.id)
          .select()
          .single();

        if (updateError) throw updateError;
        session = updatedSession;
      }

      // Get messages for existing session
      const { data: sessionMessages } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", existingSession.id)
        .order("created_at", { ascending: true });

      messages = (sessionMessages || []).map((msg) => ({
        type: msg.role === "user" ? "user" : "assistant",
        message: msg.content,
        timestamp: msg.created_at,
        qIdx: msg.q_idx || 0,
      }));
    } else {
      // ✅ 새 세션 생성: 기본적으로 시작 전에는 waiting 상태
      // 시험이 이미 시작되었는지 확인 (started_at이 있고 status가 running)
      const examStarted = examStatus === "running" && startedAt !== null && nowTime >= startedAt;

      // 시작 전: waiting 상태 (Join만 가능, 응시 불가)
      // 시작 후: in_progress 상태 (실제 응시 가능)
      const initialStatus = examStarted ? "in_progress" : "waiting";

      // Upsert session (race-safe: uses UNIQUE(exam_id, student_id) constraint)
      const { data: upsertedSession, error: upsertError } = await supabase
        .from("sessions")
        .upsert(
          {
            exam_id: exam.id,
            student_id: data.studentId,
            used_clarifications: 0,
            is_active: true,
            last_heartbeat_at: now,
            device_fingerprint: incomingFingerprint,
            created_at: now,
            status: initialStatus,
            started_at: examStarted ? now : null,
            attempt_timer_started_at: examStarted ? now : null,
          },
          { onConflict: "exam_id,student_id" }
        )
        .select()
        .single();

      if (upsertError) throw upsertError;
      session = upsertedSession;
    }

    // Fetch existing submissions for this session
    const { data: sessionSubmissions } = await supabase
      .from("submissions")
      .select("q_idx, answer")
      .eq("session_id", session.id);

    // ✅ Gate 방식: 타이머 계산 (attempt_timer_started_at 기준)
    const sessionStatus = session.status || "not_joined";
    const timerStartTime = session.attempt_timer_started_at
      ? new Date(session.attempt_timer_started_at).getTime()
      : session.started_at
      ? new Date(session.started_at).getTime()
      : null;

    // InProgress 상태이고 타이머가 시작된 경우만 시간 계산
    let timeRemaining = null;
    let sessionStartTime = session.created_at;

    if (sessionStatus === "in_progress" && timerStartTime !== null) {
      sessionStartTime = new Date(session.attempt_timer_started_at || session.started_at || session.created_at).toISOString();

      // duration이 0(무제한)이면 만료 시간을 먼 미래로 설정 (100년 후)
      const examDurationMs =
        exam.duration === 0
          ? 100 * 365 * 24 * 60 * 60 * 1000 // 100년을 밀리초로 변환
          : exam.duration * 60 * 1000; // 분을 밀리초로 변환
      const sessionEndTime = timerStartTime + examDurationMs;
      timeRemaining = Math.max(0, sessionEndTime - nowTime);
    }

    return successJson({
      exam,
      session,
      messages,
      submissions: sessionSubmissions || [],
      sessionStartTime,
      timeRemaining:
        exam.duration === 0 || timeRemaining === null
          ? null // 무제한이거나 타이머가 시작되지 않은 경우 null 반환
          : Math.floor(timeRemaining / 1000), // 초 단위
      sessionStatus, // 세션 상태 반환 (Waiting Room 표시용)
      gateStarted: examStatus === "running" && startedAt !== null && nowTime >= startedAt, // 시험 시작 여부
    });
  } catch (error) {
    logError("[initExamSession] Failed to initialize exam session", error, { path: "/api/supa/session-handlers" });
    return errorJson("INIT_SESSION_FAILED", "Failed to initialize exam session", 500);
  }
}

export async function submitExam(data: {
  examId: string;
  studentId: string;
  sessionId: string;
  answers: unknown[];
  chatHistory?: unknown[];
  feedback?: string;
  feedbackResponses?: unknown[];
}) {
  try {
    // Verify current user matches the studentId
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.id !== data.studentId) {
      return errorJson("UNAUTHORIZED", "Student ID mismatch", 403);
    }

    // Compress the session data
    const sessionData = {
      chatHistory: data.chatHistory || [],
      answers: data.answers,
      feedback: data.feedback,
      feedbackResponses: data.feedbackResponses || [],
    };

    const compressedSessionData = compressData(sessionData);

    // Update session with compressed data and deactivate
    // Guard: only update if not already submitted (prevents duplicate submissions)
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .update({
        compressed_session_data: compressedSessionData.data,
        compression_metadata: compressedSessionData.metadata,
        submitted_at: new Date().toISOString(),
        status: "submitted",
        is_active: false, // Deactivate session on submission
      })
      .eq("id", data.sessionId)
      .is("submitted_at", null)
      .select()
      .single();

    if (sessionError) {
      // If no rows matched, session was already submitted
      if (sessionError.code === "PGRST116") {
        return errorJson("ALREADY_SUBMITTED", "This session has already been submitted", 409);
      }
      throw sessionError;
    }

    // Store individual submissions with compressed data
    const submissionInserts = data.answers.map(
      (answer: unknown, index: number) => {
        const answerObj = answer as Record<string, unknown>;
        const submissionData = {
          answer: answerObj.text || answer,
          feedback: data.feedback,
          studentReply: data.feedbackResponses?.[index],
        };

        const compressedSubmissionData = compressData(submissionData);

        return {
          session_id: data.sessionId,
          q_idx: index,
          answer: answerObj.text || answer,
          ai_feedback: data.feedback ? { feedback: data.feedback } : null,
          student_reply: data.feedbackResponses?.[index],
          compressed_answer_data: compressedSubmissionData.data,
          compression_metadata: compressedSubmissionData.metadata,
        };
      }
    );

    // Upsert submissions (drafts may already exist from save_draft)
    const { data: submissions, error: submissionsError } = await supabase
      .from("submissions")
      .upsert(submissionInserts, { onConflict: "session_id,q_idx" })
      .select();

    if (submissionsError) throw submissionsError;

    // Audit log: session submit
    auditLog({
      action: "session_submit",
      userId: data.studentId,
      targetId: data.sessionId,
      details: { examId: data.examId, submissionsCount: submissions.length },
    });

    return successJson({
      session,
      submissions,
      compressionStats: compressedSessionData.metadata,
    });
  } catch (error) {
    logError("[submitExam] Failed to submit exam", error, { path: "/api/supa/session-handlers" });
    return errorJson("SUBMIT_EXAM_FAILED", "Failed to submit exam", 500);
  }
}

export async function sessionHeartbeat(data: {
  sessionId: string;
  studentId: string;
}) {
  try {
    // Verify the session belongs to the student
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, student_id, is_active, submitted_at, created_at, exam_id, status, started_at, attempt_timer_started_at")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== data.studentId) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 403);
    }

    // ✅ 이미 제출된 경우
    if (session.submitted_at) {
      return successJson({
        submitted: true,
      });
    }

    // ✅ 시험 정보 가져와서 시간 체크
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("duration")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      // 시험 정보를 가져오지 못해도 하트비트는 계속 진행
      if (examError) {
        logError("Failed to fetch exam for heartbeat", examError, { path: "/api/supa" });
      }
    } else {
      // ✅ Gate 방식: attempt_timer_started_at 기준으로 시간 체크
      // InProgress 상태이고 타이머가 시작된 경우만 시간 체크
      const sessionStatus = (session.status as string) || "not_joined";
      const timerStartTime = session.attempt_timer_started_at
        ? new Date(session.attempt_timer_started_at as string).getTime()
        : session.started_at
        ? new Date(session.started_at as string).getTime()
        : null;

      if (sessionStatus === "in_progress" && timerStartTime !== null && exam.duration !== 0) {
        const examDurationMs = exam.duration * 60 * 1000;
        const sessionEndTime = timerStartTime + examDurationMs;
        const now = Date.now();
        const timeRemaining = sessionEndTime - now;

        if (timeRemaining <= 0) {
          // ✅ 시간 종료 - 자동 제출 처리
          const { error: updateError } = await supabase
            .from("sessions")
            .update({
              submitted_at: new Date().toISOString(),
              status: "auto_submitted",
              auto_submitted: true,
              is_active: false,
            })
            .eq("id", data.sessionId);

          if (updateError) {
            logError("Failed to auto-submit session", updateError, { path: "/api/supa", additionalData: { sessionId: data.sessionId } });
          }

          return successJson({
            timeExpired: true,
            autoSubmitted: true,
          });
        }
      }
    }

    // Only update heartbeat if session is active and not submitted
    if (session.is_active && !session.submitted_at) {
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq("id", data.sessionId);

      if (updateError) throw updateError;

      // ✅ Gate 방식: attempt_timer_started_at 기준으로 남은 시간 계산
      let timeRemaining = null;
      const sessionStatus = (session.status as string) || "not_joined";
      const timerStartTime = session.attempt_timer_started_at
        ? new Date(session.attempt_timer_started_at as string).getTime()
        : session.started_at
        ? new Date(session.started_at as string).getTime()
        : null;

      if (
        exam &&
        exam.duration !== 0 &&
        sessionStatus === "in_progress" &&
        timerStartTime !== null
      ) {
        const examDurationMs = exam.duration * 60 * 1000;
        const sessionEndTime = timerStartTime + examDurationMs;
        const now = Date.now();
        timeRemaining = Math.max(0, Math.floor((sessionEndTime - now) / 1000));
      }
      // duration이 0이거나 타이머가 시작되지 않았으면 timeRemaining은 null로 유지

      return successJson({
        timeRemaining,
      });
    } else {
      // Session is not active or already submitted
      return errorJson("SESSION_INACTIVE", "Session is not active", 400);
    }
  } catch (error) {
    logError("[sessionHeartbeat] Failed to update heartbeat", error, { path: "/api/supa/session-handlers" });
    return errorJson("HEARTBEAT_FAILED", "Failed to update heartbeat", 500);
  }
}

export async function checkExamGateStatus(data: {
  examId: string;
  sessionId: string;
}) {
  try {
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, status, started_at")
      .eq("id", data.examId)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    const isRunning = exam.status === "running";

    // If running, also check the session status
    if (isRunning && data.sessionId) {
      const { data: session } = await supabase
        .from("sessions")
        .select("id, status")
        .eq("id", data.sessionId)
        .single();

      return successJson({
        gateStarted: true,
        examStatus: exam.status,
        sessionStatus: session?.status || "waiting",
      });
    }

    return successJson({
      gateStarted: false,
      examStatus: exam.status,
    });
  } catch (error) {
    logError("[checkExamGateStatus] Failed", error, { path: "/api/supa/session-handlers" });
    return errorJson("CHECK_GATE_FAILED", "Failed to check gate status", 500);
  }
}

export async function deactivateSession(data: {
  sessionId: string;
  studentId: string;
}) {
  try {
    // Verify the session belongs to the student
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, student_id")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== data.studentId) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 403);
    }

    // Deactivate the session
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ is_active: false })
      .eq("id", data.sessionId);

    if (updateError) throw updateError;

    return successJson({});
  } catch (error) {
    logError("[deactivateSession] Failed to deactivate session", error, { path: "/api/supa/session-handlers" });
    return errorJson("DEACTIVATE_SESSION_FAILED", "Failed to deactivate session", 500);
  }
}
