"use client";

import { useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import {
  isSessionConfirmedSubmitted,
  sanitizeSubmissionErrorMessage,
} from "@/lib/exam-submission";

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

interface UseExamSubmissionOptions {
  exam: { id: string; code?: string; questions: Array<{ id: string }> } | null;
  examCode: string;
  sessionId: string | null;
  userId: string | undefined;
  currentQuestion: number;
  draftAnswers: DraftAnswer[];
  chatHistory: ChatMessage[];
  manualSave: () => Promise<void>;
  setIsSubmitted: (value: boolean) => void;
}

interface UseExamSubmissionReturn {
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
  showSubmitConfirm: boolean;
  setShowSubmitConfirm: (value: boolean) => void;
  autoSubmitFailed: boolean;
  setAutoSubmitFailed: (value: boolean) => void;
  manualSubmitFailed: boolean;
  setManualSubmitFailed: (value: boolean) => void;
  submitErrorMessage: string | null;
  setSubmitErrorMessage: (value: string | null) => void;
  unansweredDialog: { open: boolean; indices: number[] };
  setUnansweredDialog: (value: { open: boolean; indices: number[] }) => void;
  showPreflightCancelConfirm: boolean;
  setShowPreflightCancelConfirm: (value: boolean) => void;
  handlePaste: (pasteData: {
    pastedText: string;
    pasteStart: number;
    pasteEnd: number;
    answerLengthBefore: number;
    answerTextBefore: string;
    isInternal: boolean;
  }) => Promise<void>;
  handleSubmitClick: () => void;
  handleSubmit: () => Promise<void>;
  handleTimeExpired: () => Promise<void>;
}

function isHtmlEmpty(html: string): boolean {
  if (!html) return true;
  const textContent = html.replace(/<[^>]*>/g, "").trim();
  return textContent.length === 0;
}

export function useExamSubmission({
  exam,
  examCode,
  sessionId,
  userId,
  currentQuestion,
  draftAnswers,
  chatHistory,
  manualSave,
  setIsSubmitted,
}: UseExamSubmissionOptions): UseExamSubmissionReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [autoSubmitFailed, setAutoSubmitFailed] = useState(false);
  const [manualSubmitFailed, setManualSubmitFailed] = useState(false);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [unansweredDialog, setUnansweredDialog] = useState<{ open: boolean; indices: number[] }>({ open: false, indices: [] });
  const [showPreflightCancelConfirm, setShowPreflightCancelConfirm] = useState(false);
  const timeExpiredCalledRef = useRef(false);

  const parseErrorResponse = useCallback(async (response: Response): Promise<{
    message: string;
    data: Record<string, unknown> | null;
  }> => {
    const contentType = response.headers.get("content-type");

    try {
      if (contentType && contentType.includes("application/json")) {
        const parsed = await response.json();
        const data =
          parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : null;
        const rawMessage =
          typeof data?.message === "string"
            ? data.message
            : typeof data?.error === "string"
            ? data.error
            : null;

        return {
          message: sanitizeSubmissionErrorMessage(rawMessage, {
            status: response.status,
            contentType,
          }),
          data,
        };
      }

      const text = await response.text();
      return {
        message: sanitizeSubmissionErrorMessage(text, {
          status: response.status,
          contentType,
        }),
        data: null,
      };
    } catch {
      return {
        message: sanitizeSubmissionErrorMessage(null, {
          status: response.status,
          contentType,
        }),
        data: null,
      };
    }
  }, []);

  const checkSubmissionOnServer = useCallback(
    async (code: string, attempts: number = 1): Promise<boolean> => {
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const res = await fetch(`/api/student/sessions?examCode=${encodeURIComponent(code)}`);
          if (res.ok) {
            const data = await res.json();
            const sessions = Array.isArray(data) ? data : data.sessions || [];

            if (
              sessions.some(
                (session: {
                  status?: string | null;
                  submittedAt?: string | null;
                  submitted_at?: string | null;
                  autoSubmitted?: boolean | null;
                  auto_submitted?: boolean | null;
                }) => isSessionConfirmedSubmitted(session)
              )
            ) {
              return true;
            }
          }
        } catch {
          // Retry below
        }

        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
      }

      return false;
    },
    []
  );

  const recoverSubmissionFromServer = useCallback(async (): Promise<boolean> => {
    if (!sessionId) {
      return checkSubmissionOnServer(examCode, 3);
    }

    if (userId) {
      try {
        const heartbeatResponse = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "session_heartbeat",
            data: { sessionId, studentId: userId },
          }),
        });

        if (heartbeatResponse.ok) {
          const heartbeatData = await heartbeatResponse.json().catch(() => null);
          if (
            heartbeatData?.submitted ||
            heartbeatData?.autoSubmitted ||
            heartbeatData?.timeExpired
          ) {
            return checkSubmissionOnServer(examCode, 4);
          }
        }
      } catch {
        // Fall through to direct status polling
      }
    }

    return checkSubmissionOnServer(examCode, 4);
  }, [sessionId, userId, examCode, checkSubmissionOnServer]);

  const handlePaste = useCallback(
    async (pasteData: {
      pastedText: string;
      pasteStart: number;
      pasteEnd: number;
      answerLengthBefore: number;
      answerTextBefore: string;
      isInternal: boolean;
    }) => {
      const {
        pastedText,
        pasteStart,
        pasteEnd,
        answerLengthBefore,
        isInternal,
      } = pasteData;

      try {
        await fetch("/api/log/paste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            length: pastedText.length,
            pasted_text: pastedText,
            paste_start: pasteStart,
            paste_end: pasteEnd,
            answer_length_before: answerLengthBefore,
            isInternal,
            ts: Date.now(),
            examCode,
            questionId: exam?.questions[currentQuestion]?.id,
            sessionId,
          }),
        });
      } catch {
        // Paste logging failure is non-critical
      }
    },
    [examCode, exam, sessionId, currentQuestion]
  );

  const handleSubmitClick = useCallback(() => {
    if (!exam) return;

    const unansweredIndices = draftAnswers
      .map((answer, idx) => (isHtmlEmpty(answer.text) ? idx : -1))
      .filter((idx) => idx !== -1);
    if (unansweredIndices.length > 0) {
      setUnansweredDialog({ open: true, indices: unansweredIndices });
      return;
    }

    if (!sessionId) {
      toast.error("세션 정보를 찾을 수 없습니다. 페이지를 새로고침해주세요.");
      return;
    }

    setShowSubmitConfirm(true);
  }, [exam, draftAnswers, sessionId]);

  const handleSubmit = useCallback(async () => {
    if (!exam) return;

    setIsSubmitting(true);
    setShowSubmitConfirm(false);
    setSubmitErrorMessage(null);

    try {
      await manualSave();

      const sanitizedAnswers = draftAnswers.map((answer) => ({
        ...answer,
        text: answer.text?.replace(/\u0000/g, "") || "",
      }));

      const transformedChatHistory = chatHistory.map((msg) => ({
        type: msg.type === "user" ? "student" : "ai",
        content: msg.message,
        timestamp: msg.timestamp,
      }));

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examCode,
          answers: sanitizedAnswers,
          examId: exam.id,
          sessionId,
          chatHistory: transformedChatHistory,
          studentId: userId,
        }),
      });

      if (response.ok) {
        setIsSubmitted(true);
        setManualSubmitFailed(false);
      } else if (response.status === 409) {
        // Already submitted — treat as success
        setIsSubmitted(true);
        setManualSubmitFailed(false);
      } else {
        const { message } = await parseErrorResponse(response);
        const actuallySubmitted = await recoverSubmissionFromServer();
        if (actuallySubmitted) {
          setIsSubmitted(true);
          setManualSubmitFailed(false);
        } else {
          setSubmitErrorMessage(message);
          setManualSubmitFailed(true);
        }
      }
    } catch {
      const actuallySubmitted = await recoverSubmissionFromServer();
      if (actuallySubmitted) {
        setIsSubmitted(true);
        setManualSubmitFailed(false);
      } else {
        setSubmitErrorMessage("네트워크 연결을 확인하고 다시 시도해주세요.");
        setManualSubmitFailed(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [exam, examCode, sessionId, userId, draftAnswers, chatHistory, manualSave, setIsSubmitted, parseErrorResponse, recoverSubmissionFromServer]);

  const handleTimeExpired = useCallback(async () => {
    if (timeExpiredCalledRef.current) return;
    timeExpiredCalledRef.current = true;
    if (!sessionId || !exam || false /* isSubmitted checked by caller */) return;

    setIsSubmitting(true);
    setAutoSubmitFailed(false);

    const MAX_RETRIES = 3;
    let submitted = false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt === 1) await manualSave();

        const sanitizedAnswers = draftAnswers.map((answer) => ({
          ...answer,
          text: answer.text?.replace(/\u0000/g, "") || "",
        }));

        const transformedChatHistory = chatHistory.map((msg) => ({
          type: msg.type === "user" ? "student" : "ai",
          content: msg.message,
          timestamp: msg.timestamp,
        }));

        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examCode,
            answers: sanitizedAnswers,
            examId: exam.id,
            sessionId,
            chatHistory: transformedChatHistory,
            studentId: userId,
          }),
        });

        if (response.ok) {
          setIsSubmitted(true);
          submitted = true;
          break;
        } else if (response.status === 409) {
          // Already submitted — treat as success
          setIsSubmitted(true);
          submitted = true;
          break;
        } else {
          const recovered = await recoverSubmissionFromServer();
          if (recovered) {
            setIsSubmitted(true);
            submitted = true;
            break;
          }
        }
      } catch {
        const recovered = await recoverSubmissionFromServer();
        if (recovered) {
          setIsSubmitted(true);
          submitted = true;
          break;
        }
      }

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    if (!submitted) {
      const actuallySubmitted = await recoverSubmissionFromServer();
      if (actuallySubmitted) {
        setIsSubmitted(true);
      } else {
        try { await manualSave(); } catch {}
        setAutoSubmitFailed(true);
      }
    }
    setIsSubmitting(false);
  }, [sessionId, exam, examCode, userId, draftAnswers, chatHistory, manualSave, setIsSubmitted, recoverSubmissionFromServer]);

  return {
    isSubmitting,
    setIsSubmitting,
    showSubmitConfirm,
    setShowSubmitConfirm,
    autoSubmitFailed,
    setAutoSubmitFailed,
    manualSubmitFailed,
    setManualSubmitFailed,
    submitErrorMessage,
    setSubmitErrorMessage,
    unansweredDialog,
    setUnansweredDialog,
    showPreflightCancelConfirm,
    setShowPreflightCancelConfirm,
    handlePaste,
    handleSubmitClick,
    handleSubmit,
    handleTimeExpired,
  };
}
