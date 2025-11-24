/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { redirect } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useState, useEffect, use, useCallback } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GradeHeader } from "@/components/instructor/GradeHeader";
import { QuestionNavigation } from "@/components/instructor/QuestionNavigation";
import { QuestionPromptCard } from "@/components/instructor/QuestionPromptCard";
import { AIConversationsCard } from "@/components/instructor/AIConversationsCard";
import { FinalAnswerCard } from "@/components/instructor/FinalAnswerCard";
import { AIFeedbackCard } from "@/components/instructor/AIFeedbackCard";
import { StudentReplyCard } from "@/components/instructor/StudentReplyCard";
import { GradingPanel } from "@/components/instructor/GradingPanel";
import { QuickActionsCard } from "@/components/instructor/QuickActionsCard";

interface Conversation {
  id: string;
  role: "user" | "ai";
  content: string;
  created_at: string;
}

interface Question {
  id: string;
  idx: number;
  type: string;
  prompt: string;
  ai_context?: string;
}

interface Submission {
  id: string;
  q_idx: number;
  answer: string;
  ai_feedback?: Record<string, unknown>;
  student_reply?: string;
  decompressed?: {
    answerData?: Record<string, unknown>;
    feedbackData?: Record<string, unknown>;
  };
}

interface Grade {
  id: string;
  q_idx: number;
  score: number;
  comment?: string;
  stage_grading?: {
    chat?: { score: number; comment: string };
    answer?: { score: number; comment: string };
    feedback?: { score: number; comment: string };
  };
}

type StageKey = "chat" | "answer" | "feedback";

interface SessionData {
  session: {
    id: string;
    exam_id: string;
    student_id: string;
    submitted_at: string;
    used_clarifications: number;
    created_at: string;
    ai_summary?: SummaryData;
  };
  exam: {
    id: string;
    title: string;
    code: string;
    questions: Question[];
  };
  student: {
    name: string;
    email: string;
  };
  submissions: Record<string, Submission>;
  messages: Record<string, Conversation[]>;
  grades: Record<string, Grade>;
  overallScore: number | null;
}

import {
  AIOverallSummary,
  SummaryData,
} from "@/components/instructor/AIOverallSummary";

export default function GradeStudentPage({
  params,
}: {
  params: Promise<{ examId: string; studentId: string }>;
}) {
  const resolvedParams = use(params);
  const { isSignedIn, isLoaded, user } = useUser();

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [feedbacks, setFeedbacks] = useState<Record<number, string>>({});
  const [stageScores, setStageScores] = useState<
    Record<number, Partial<Record<StageKey, number>>>
  >({});
  const [stageComments, setStageComments] = useState<
    Record<number, Partial<Record<StageKey, string>>>
  >({});
  const [saving, setSaving] = useState(false);
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState<number>(0);
  const [autoGrading, setAutoGrading] = useState(false);
  const [overallSummary, setOverallSummary] = useState<SummaryData | null>(
    null
  );
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Redirect non-instructors
  useEffect(() => {
    if (
      isLoaded &&
      (!isSignedIn || (user?.unsafeMetadata?.role as string) !== "instructor")
    ) {
      redirect("/student");
    }
  }, [isLoaded, isSignedIn, user]);

  const handleGenerateSummary = async (targetSessionId?: string) => {
    const idToUse = targetSessionId || sessionData?.session?.id;
    if (!idToUse) return;

    try {
      setSummaryLoading(true);
      const response = await fetch("/api/instructor/generate-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: idToUse,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate summary");
      }

      const data = await response.json();
      setOverallSummary(data.summary);
    } catch (error) {
      console.error("Error generating summary:", error);
      alert("요약 생성 중 오류가 발생했습니다.");
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleAutoGrade = useCallback(
    async (forceRegrade: boolean = false) => {
      try {
        setAutoGrading(true);
        const response = await fetch(
          `/api/session/${resolvedParams.studentId}/grade`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              forceRegrade,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: "Failed to parse error response",
          }));
          if (errorData.skipped) {
            // Already graded, skip silently
            return;
          }
          throw new Error(
            errorData.details ||
              errorData.message ||
              errorData.error ||
              "Failed to auto-grade"
          );
        }

        const result = await response.json();

        if (result.skipped) {
          alert("이미 채점이 완료되었습니다.");
          return;
        }

        // Refresh data to get updated grades
        const refreshResponse = await fetch(
          `/api/session/${resolvedParams.studentId}/grade`
        );
        if (refreshResponse.ok) {
          const data: SessionData = await refreshResponse.json();
          setSessionData(data);

          // Update scores and feedbacks
          const updatedScores: Record<number, number> = {};
          const updatedFeedbacks: Record<number, string> = {};
          const updatedStageScores: Record<
            number,
            Partial<Record<StageKey, number>>
          > = {};
          const updatedStageComments: Record<
            number,
            Partial<Record<StageKey, string>>
          > = {};

          Object.entries(data.grades).forEach(([qIdx, grade]) => {
            updatedScores[parseInt(qIdx)] = grade.score;
            updatedFeedbacks[parseInt(qIdx)] = grade.comment || "";

            // Load stage grading data
            if (grade.stage_grading) {
              const stageGrading = grade.stage_grading;
              if (stageGrading.chat) {
                updatedStageScores[parseInt(qIdx)] = {
                  ...updatedStageScores[parseInt(qIdx)],
                  chat: stageGrading.chat.score,
                };
                updatedStageComments[parseInt(qIdx)] = {
                  ...updatedStageComments[parseInt(qIdx)],
                  chat: stageGrading.chat.comment,
                };
              }
              if (stageGrading.answer) {
                updatedStageScores[parseInt(qIdx)] = {
                  ...updatedStageScores[parseInt(qIdx)],
                  answer: stageGrading.answer.score,
                };
                updatedStageComments[parseInt(qIdx)] = {
                  ...updatedStageComments[parseInt(qIdx)],
                  answer: stageGrading.answer.comment,
                };
              }
              if (stageGrading.feedback) {
                updatedStageScores[parseInt(qIdx)] = {
                  ...updatedStageScores[parseInt(qIdx)],
                  feedback: stageGrading.feedback.score,
                };
                updatedStageComments[parseInt(qIdx)] = {
                  ...updatedStageComments[parseInt(qIdx)],
                  feedback: stageGrading.feedback.comment,
                };
              }
            }
          });

          setScores(updatedScores);
          setFeedbacks(updatedFeedbacks);
          setStageScores(updatedStageScores);
          setStageComments(updatedStageComments);

          const gradedCount = Object.keys(data.grades).length;
          alert(`자동 채점이 완료되었습니다. (${gradedCount}문제)`);
        }
      } catch (error) {
        console.error("Error auto-grading:", error);
        alert(
          `자동 채점 중 오류가 발생했습니다: ${
            (error as Error)?.message || "알 수 없는 오류"
          }`
        );
      } finally {
        setAutoGrading(false);
      }
    },
    [resolvedParams.studentId]
  );

  useEffect(() => {
    const fetchSessionData = async () => {
      try {
        setLoading(true);
        // studentId is actually sessionId in the URL
        const response = await fetch(
          `/api/session/${resolvedParams.studentId}/grade`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch session data");
        }

        const data: SessionData = await response.json();

        // Debug logging
        console.log("📊 Fetched session data:", data);
        console.log("📝 Exam questions:", data.exam?.questions);
        console.log("💬 Messages:", data.messages);
        console.log("📤 Submissions:", data.submissions);

        setSessionData(data);
        setOverallSummary(data.session.ai_summary || null);

        // Initialize scores and feedbacks from existing grades
        const initialScores: Record<number, number> = {};
        const initialFeedbacks: Record<number, string> = {};
        const initialStageScores: Record<
          number,
          Partial<Record<StageKey, number>>
        > = {};
        const initialStageComments: Record<
          number,
          Partial<Record<StageKey, string>>
        > = {};

        Object.entries(data.grades).forEach(([qIdx, grade]) => {
          initialScores[parseInt(qIdx)] = grade.score;
          initialFeedbacks[parseInt(qIdx)] = grade.comment || "";

          // Load stage grading data
          if (grade.stage_grading) {
            const stageGrading = grade.stage_grading;
            if (stageGrading.chat) {
              initialStageScores[parseInt(qIdx)] = {
                ...initialStageScores[parseInt(qIdx)],
                chat: stageGrading.chat.score,
              };
              initialStageComments[parseInt(qIdx)] = {
                ...initialStageComments[parseInt(qIdx)],
                chat: stageGrading.chat.comment,
              };
            }
            if (stageGrading.answer) {
              initialStageScores[parseInt(qIdx)] = {
                ...initialStageScores[parseInt(qIdx)],
                answer: stageGrading.answer.score,
              };
              initialStageComments[parseInt(qIdx)] = {
                ...initialStageComments[parseInt(qIdx)],
                answer: stageGrading.answer.comment,
              };
            }
            if (stageGrading.feedback) {
              initialStageScores[parseInt(qIdx)] = {
                ...initialStageScores[parseInt(qIdx)],
                feedback: stageGrading.feedback.score,
              };
              initialStageComments[parseInt(qIdx)] = {
                ...initialStageComments[parseInt(qIdx)],
                feedback: stageGrading.feedback.comment,
              };
            }
          }
        });

        setScores(initialScores);
        setFeedbacks(initialFeedbacks);
        setStageScores(initialStageScores);
        setStageComments(initialStageComments);

        // Auto-grade if no grades exist
        const hasGrades = Object.keys(data.grades).length > 0;
        if (!hasGrades) {
          // console.log("🤖 No grades found, starting auto-grading...");
          //           handleAutoGrade(false);
        }

        // Initial AI Summary generation if not exists
        if (!data.session.ai_summary) {
          handleGenerateSummary(data.session.id);
        }
      } catch (error) {
        console.error("Error fetching session data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSessionData();
  }, [resolvedParams.studentId, handleAutoGrade]);

  const handleSaveGrade = async (questionIdx: number) => {
    try {
      setSaving(true);
      const response = await fetch(
        `/api/session/${resolvedParams.studentId}/grade`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            questionIdx,
            score: scores[questionIdx] || 0,
            comment: feedbacks[questionIdx] || "",
            stageGrading: {
              chat: stageScores[questionIdx]?.chat
                ? {
                    score: stageScores[questionIdx]?.chat || 0,
                    comment: stageComments[questionIdx]?.chat || "",
                  }
                : undefined,
              answer: stageScores[questionIdx]?.answer
                ? {
                    score: stageScores[questionIdx]?.answer || 0,
                    comment: stageComments[questionIdx]?.answer || "",
                  }
                : undefined,
              feedback: stageScores[questionIdx]?.feedback
                ? {
                    score: stageScores[questionIdx]?.feedback || 0,
                    comment: stageComments[questionIdx]?.feedback || "",
                  }
                : undefined,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save grade");
      }

      // Refresh data to get updated overall score
      const refreshResponse = await fetch(
        `/api/session/${resolvedParams.studentId}/grade`
      );
      if (refreshResponse.ok) {
        const data: SessionData = await refreshResponse.json();
        setSessionData(data);
      }

      alert("채점이 저장되었습니다.");
    } catch (error) {
      console.error("Error saving grade:", error);
      alert("채점 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleStageScoreChange = (stage: StageKey, value: number) => {
    setStageScores((prev) => ({
      ...prev,
      [selectedQuestionIdx]: {
        ...(prev[selectedQuestionIdx] || {}),
        [stage]: value,
      },
    }));
  };

  const handleStageCommentChange = (stage: StageKey, value: string) => {
    setStageComments((prev) => ({
      ...prev,
      [selectedQuestionIdx]: {
        ...(prev[selectedQuestionIdx] || {}),
        [stage]: value,
      },
    }));
  };

  // Show loading while auth is loading
  if (!isLoaded) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // Don't render anything if not authorized
  if (!isSignedIn || (user?.unsafeMetadata?.role as string) !== "instructor") {
    return null;
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            제출물을 찾을 수 없습니다
          </h2>
          <Link href={`/instructor/${resolvedParams.examId}`}>
            <Button variant="outline">돌아가기</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Get current question data
  const currentQuestion = sessionData.exam?.questions?.[selectedQuestionIdx];
  const currentSubmission = sessionData.submissions?.[selectedQuestionIdx] as
    | Submission
    | undefined;

  // Try to get messages by both index and question.id (for backward compatibility)
  let currentMessages = (sessionData.messages?.[selectedQuestionIdx] ||
    []) as Conversation[];

  // If no messages found by index, try using question.id
  if (currentMessages.length === 0 && currentQuestion?.id) {
    currentMessages = (sessionData.messages?.[currentQuestion.id] ||
      []) as Conversation[];
  }

  // Debug logging for current data
  console.log("🔍 Current question index:", selectedQuestionIdx);
  console.log("❓ Current question:", currentQuestion);
  console.log("❓ Current question ID:", currentQuestion?.id);
  console.log("📤 Current submission:", currentSubmission);
  console.log("💬 Current messages:", currentMessages);
  console.log("💬 All messages keys:", Object.keys(sessionData.messages || {}));

  // Separate messages into AI conversations (before submission) and feedback conversations (after submission)
  const aiConversations = currentMessages.filter(
    (msg) => msg.role === "user" || msg.role === "ai"
  );

  // For now, we'll assume all messages are AI conversations during the exam
  // In a real implementation, you might have a flag or timestamp to distinguish
  const duringExamMessages = aiConversations;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <GradeHeader
        studentName={sessionData.student.name}
        submittedAt={sessionData.session.submitted_at}
        overallScore={sessionData.overallScore}
        examId={resolvedParams.examId}
        onAutoGrade={() => handleAutoGrade(true)}
        autoGrading={autoGrading}
      />

      <div className="mb-6">
        <AIOverallSummary
          summary={overallSummary}
          loading={summaryLoading}
          onGenerate={handleGenerateSummary}
        />
      </div>

      <QuestionNavigation
        questions={sessionData.exam?.questions || []}
        selectedQuestionIdx={selectedQuestionIdx}
        onSelectQuestion={setSelectedQuestionIdx}
        grades={sessionData.grades}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <QuestionPromptCard
            question={currentQuestion}
            questionNumber={selectedQuestionIdx + 1}
          />

          <AIConversationsCard messages={duringExamMessages} />

          <FinalAnswerCard submission={currentSubmission} />

          <AIFeedbackCard
            submission={currentSubmission}
            submittedAt={sessionData.session.submitted_at}
          />

          <StudentReplyCard submission={currentSubmission} />
        </div>

        <div className="space-y-6">
          <GradingPanel
            questionNumber={selectedQuestionIdx + 1}
            stageScores={stageScores[selectedQuestionIdx] || {}}
            stageComments={stageComments[selectedQuestionIdx] || {}}
            overallScore={scores[selectedQuestionIdx] || 0}
            overallFeedback={feedbacks[selectedQuestionIdx] || ""}
            isGraded={!!sessionData.grades[selectedQuestionIdx]}
            saving={saving}
            onStageScoreChange={handleStageScoreChange}
            onStageCommentChange={handleStageCommentChange}
            onOverallScoreChange={(value) =>
              setScores({
                ...scores,
                [selectedQuestionIdx]: value,
              })
            }
            onOverallFeedbackChange={(value) =>
              setFeedbacks({
                ...feedbacks,
                [selectedQuestionIdx]: value,
              })
            }
            onSave={() => handleSaveGrade(selectedQuestionIdx)}
          />

          <QuickActionsCard
            sessionId={sessionData.session.id}
            isGraded={
              Object.keys(sessionData.grades || {}).length > 0 &&
              sessionData.overallScore !== null
            }
            reportData={
              sessionData
                ? {
                    exam: {
                      title: sessionData.exam.title,
                      code: sessionData.exam.code,
                      questions: sessionData.exam.questions.map((q) => ({
                        id: q.id,
                        idx: q.idx,
                        type: q.type,
                        prompt: q.prompt,
                      })),
                      description: undefined, // Not available in SessionData
                    },
                    session: {
                      submitted_at: sessionData.session.submitted_at,
                    },
                    grades: Object.fromEntries(
                      Object.entries(sessionData.grades).map(([key, grade]) => [
                        parseInt(key),
                        {
                          id: grade.id,
                          q_idx: grade.q_idx,
                          score: grade.score,
                          comment: grade.comment,
                        },
                      ])
                    ),
                    overallScore: sessionData.overallScore,
                    studentName: sessionData.student.name,
                    aiSummary: undefined, // Can be fetched separately if needed
                  }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
