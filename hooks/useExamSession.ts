"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";

interface Question {
  id: string;
  text: string;
  type: string;
  points: number;
  title?: string;
  ai_context?: string;
}

interface Exam {
  id: string;
  title: string;
  code: string;
  description: string;
  duration: number;
  questions: Question[];
  status: string;
  startTime?: string;
  endTime?: string;
  rubric?: Array<{
    id?: string;
    evaluationArea: string;
    detailedCriteria: string;
  }>;
  rubric_public?: boolean;
  allow_draft_in_waiting?: boolean;
  allow_chat_in_waiting?: boolean;
}

interface DraftAnswer {
  questionId: string;
  text: string;
  lastSaved?: string;
}

interface ChatMessage {
  type: "user" | "assistant";
  message: string;
  timestamp: string;
  qIdx: number;
}

interface UseExamSessionOptions {
  examCode: string;
  user: { id: string } | null | undefined;
  isLoaded: boolean;
  // State setters owned by the page component
  setExam: (exam: Exam | null) => void;
  setSessionId: (id: string | null) => void;
  setDraftAnswers: (answers: DraftAnswer[]) => void;
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  saveViaBeacon: () => void;
}

export function useExamSession({
  examCode,
  user,
  isLoaded,
  setExam,
  setSessionId,
  setDraftAnswers,
  setChatHistory,
  saveViaBeacon,
}: UseExamSessionOptions) {
  const router = useRouter();

  // Session-specific state (not shared with other hooks)
  const [sessionStartTime, setSessionStartTime] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [examInitialized, setExamInitialized] = useState(false);
  const [showPreflight, setShowPreflight] = useState(false);
  const [isInWaitingRoom, setIsInWaitingRoom] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  // Internal refs for beforeunload (track latest values)
  const sessionIdRef = useRef<string | null>(null);
  const [heartbeatSessionId, setHeartbeatSessionId] = useState<string | null>(null);
  const isSubmittedRef = useRef(false);
  isSubmittedRef.current = isSubmitted;

  const saveViaBeaconRef = useRef(saveViaBeacon);
  saveViaBeaconRef.current = saveViaBeacon;

  // Profile gate
  const [profileGateChecked, setProfileGateChecked] = useState(false);
  const { data: profileGateData } = useQuery({
    queryKey: ["student-profile-gate", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/student/profile");
      if (!response.ok) return { hasProfile: false };
      const data = await response.json();
      return { hasProfile: !!data.profile };
    },
    enabled: !!user && isLoaded,
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!profileGateData || profileGateChecked) return;
    if (!profileGateData.hasProfile) {
      router.replace(`/student/profile-setup?redirect=${encodeURIComponent(`/exam/${examCode}`)}`);
      return;
    }
    setProfileGateChecked(true);
  }, [profileGateData, profileGateChecked, router, examCode]);

  // Session init query
  const { data: initData, isLoading: initLoading } = useQuery({
    queryKey: ["exam-session-init", examCode, user?.id],
    queryFn: async () => {
      try {
        const deviceFingerprint = getDeviceFingerprint();
        const response = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "init_exam_session",
            data: { examCode, studentId: user!.id, deviceFingerprint },
          }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return { ok: false as const, errorData };
        }
        return { ok: true as const, ...(await response.json()) };
      } catch {
        return { ok: false as const, errorData: { error: "NETWORK_ERROR" } };
      }
    },
    enabled: !!examCode && isLoaded && !!user && profileGateChecked,
    retry: false,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
  });

  const examLoading = initLoading || (!examInitialized && !initData);

  // Process init data — sets external state via setters
  useEffect(() => {
    if (!initData) return;

    if (!initData.ok) {
      const { errorData } = initData;
      if (errorData.error === "Exam already submitted" || errorData.isRetakeBlocked) {
        router.push("/join?error=already_submitted");
      } else {
        const errorCodeMap: Record<string, string> = {
          UNAUTHORIZED: "unauthorized",
          EXAM_NOT_FOUND: "exam_not_found",
          EXAM_NOT_AVAILABLE: "exam_not_available",
          ENTRY_WINDOW_CLOSED: "entry_window_closed",
          INIT_SESSION_FAILED: "server_error",
          NETWORK_ERROR: "network_error",
        };
        const errorParam = errorCodeMap[errorData.error] || "network_error";
        router.push(`/join?error=${errorParam}`);
      }
      return;
    }

    if (!initData.exam) {
      router.push("/join?error=exam_not_found");
      return;
    }

    setExam(initData.exam);

    if (initData.isRetakeBlocked) {
      setIsSubmitted(true);
      setSessionId(initData.session.id);
      sessionIdRef.current = initData.session.id;
      setHeartbeatSessionId(initData.session.id);
      if (initData.messages) setChatHistory(initData.messages);
      setExamInitialized(true);
      return;
    }

    if (initData.autoSubmitted || initData.timeExpired) {
      setIsSubmitted(true);
      setSessionId(initData.session.id);
      sessionIdRef.current = initData.session.id;
      setHeartbeatSessionId(initData.session.id);
      if (initData.messages) setChatHistory(initData.messages);
      setExamInitialized(true);
      return;
    }

    // Initialize draft answers
    const submissions = initData.submissions || [];
    setDraftAnswers(
      initData.exam.questions.map((q: Question, index: number) => {
        const submission = submissions.find(
          (sub: { q_idx: number; answer: string }) => sub.q_idx === index
        );
        return { questionId: q.id, text: submission?.answer || "" };
      })
    );

    if (initData.session) {
      setSessionId(initData.session.id);
      sessionIdRef.current = initData.session.id;
      setHeartbeatSessionId(initData.session.id);

      const currentSessionStatus =
        initData.sessionStatus || initData.session.status || "not_joined";
      setSessionStatus(currentSessionStatus);

      if (
        currentSessionStatus === "joined" ||
        (!initData.session.preflight_accepted_at &&
          currentSessionStatus !== "in_progress" &&
          currentSessionStatus !== "submitted" &&
          currentSessionStatus !== "auto_submitted")
      ) {
        setShowPreflight(true);
      }

      if (currentSessionStatus === "waiting") {
        setIsInWaitingRoom(true);
      }

      if (initData.sessionStartTime) {
        setSessionStartTime(initData.sessionStartTime);
      } else if (initData.session.created_at) {
        setSessionStartTime(initData.session.created_at);
      }

      if (initData.timeRemaining !== undefined) {
        setTimeRemaining(initData.timeRemaining);
      }

      if (initData.session.submitted_at) {
        setIsSubmitted(true);
      }

      if (initData.messages) {
        setChatHistory(initData.messages);
      } else {
        setChatHistory([]);
      }
    } else {
      setSessionError(true);
    }

    if (initData.sessionReactivated) {
      toast.success("이전 세션이 복원되었습니다. 답안이 유지되어 있습니다.", {
        duration: 4000,
        icon: "🔄",
      });
    }

    setExamInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData, router]);

  // Heartbeat — uses heartbeatSessionId state for reactive query key
  const { data: heartbeatData } = useQuery({
    queryKey: ["session-heartbeat", heartbeatSessionId],
    queryFn: async () => {
      const sid = heartbeatSessionId;
      if (!sid) return null;
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "session_heartbeat",
          data: { sessionId: sid, studentId: user!.id },
        }),
      });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!heartbeatSessionId && !!user && !isSubmitted,
    refetchInterval: timeRemaining !== null && timeRemaining <= 300 ? 30000 : 60000,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (!heartbeatData) return;
    if (heartbeatData.timeExpired || heartbeatData.autoSubmitted) {
      setIsSubmitted(true);
    }
    if (heartbeatData.timeRemaining !== undefined) {
      setTimeRemaining(heartbeatData.timeRemaining);
    }
  }, [heartbeatData]);

  // Session deactivation on unload/unmount
  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid || !user || isSubmitted) return;

    const handleBeforeUnload = () => {
      saveViaBeaconRef.current();

      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/supa",
          JSON.stringify({
            action: "deactivate_session",
            data: { sessionId: sid, studentId: user.id },
          })
        );
      } else {
        fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deactivate_session",
            data: { sessionId: sid, studentId: user.id },
          }),
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (!isSubmittedRef.current) {
        fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deactivate_session",
            data: { sessionId: sid, studentId: user.id },
          }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdRef.current, user, isSubmitted]);

  return {
    sessionStartTime,
    timeRemaining,
    isSubmitted,
    setIsSubmitted,
    showPreflight,
    setShowPreflight,
    isInWaitingRoom,
    setIsInWaitingRoom,
    sessionError,
    setSessionError,
    examInitialized,
    examLoading,
    sessionStatus,
    setSessionStatus,
    setTimeRemaining,
    setSessionStartTime,
  };
}
