"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { useRouter } from "next/navigation";

interface Exam {
  id: string;
  title: string;
  code: string;
  type: string;
  deadline: string | null;
  questions: unknown[];
  rubric: unknown[];
  assignment_prompt: string | null;
  status: string;
  materials: string[];
}

interface Session {
  id: string;
  status: string;
  submitted_at: string | null;
}

export function useAssignmentSession(code: string) {
  const { user, profile, isLoaded, isSignedIn } = useAppUser();
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canvasContent, setCanvasContent] = useState("");

  const initSession = useCallback(async () => {
    if (!isLoaded || !isSignedIn || !user) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch exam by code
      const examRes = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_exam", data: { code } }),
      });

      if (!examRes.ok) {
        const errData = await examRes.json().catch(() => ({}));
        throw new Error(errData.message || "과제를 찾을 수 없습니다.");
      }

      const examData = await examRes.json();
      const fetchedExam = examData.exam;

      if (!fetchedExam || !fetchedExam.type || fetchedExam.type === "exam") {
        router.replace(`/exam/${code}`);
        return;
      }

      setExam(fetchedExam);

      // Init session via existing initExamSession
      const sessionRes = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init_exam_session",
          data: { examCode: code, studentId: user.id },
        }),
      });

      if (!sessionRes.ok) {
        const errData = await sessionRes.json().catch(() => ({}));
        const errorMessages: Record<string, string> = {
          ENTRY_WINDOW_CLOSED: "제출 기한이 마감되었습니다.",
          ENTRY_WINDOW_NOT_OPEN: "아직 과제가 시작되지 않았습니다.",
          EXAM_NOT_AVAILABLE: "과제가 종료되었거나 비공개 상태입니다.",
          EXAM_NOT_FOUND: "과제를 찾을 수 없습니다.",
        };
        const friendlyMsg = errorMessages[errData.error] || errData.message || "세션 생성에 실패했습니다.";
        throw new Error(friendlyMsg);
      }

      const sessionData = await sessionRes.json();
      const sessionId = sessionData.session?.id;
      setSession({
        id: sessionId,
        status: sessionData.sessionStatus || sessionData.session?.status || "in_progress",
        submitted_at: sessionData.session?.submitted_at || null,
      });

      // Load existing canvas content
      if (sessionId) {
        const subRes = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_session_submissions",
            data: { sessionId },
          }),
        });

        if (subRes.ok) {
          const subData = await subRes.json();
          const submissions = subData.submissions || [];
          const canvasSub = submissions.find(
            (s: { q_idx: number }) => s.q_idx === 0
          );
          if (canvasSub?.answer) {
            setCanvasContent(canvasSub.answer);
          }
        }

        // Load existing messages
        const msgRes = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_session_messages",
            data: { sessionId },
          }),
        });

        if (msgRes.ok) {
          const msgData = await msgRes.json();
          return {
            sessionId,
            existingMessages: msgData.messages || [],
          };
        }
      }

      return { sessionId, existingMessages: [] };
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [code, isLoaded, isSignedIn, user, router]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  return {
    exam,
    session,
    isLoading,
    error,
    canvasContent,
    setCanvasContent,
    userId: user?.id || "",
  };
}
