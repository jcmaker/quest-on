"use client";

import { useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { QuestionPanel } from "@/components/exam/QuestionPanel";
import { AnswerPanel } from "@/components/exam/AnswerPanel";
import { SubmitConfirmDialog } from "@/components/exam/SubmitConfirmDialog";
import { ExamChatSidebar } from "@/components/exam/ExamChatSidebar";
import { MainContentWrapper } from "@/components/exam/MainContentWrapper";
import { ExamDialogs } from "@/components/exam/ExamDialogs";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useExamChat } from "@/hooks/useExamChat";
import { useExamSession } from "@/hooks/useExamSession";
import { useExamGuards } from "@/hooks/useExamGuards";
import { useExamSubmission } from "@/hooks/useExamSubmission";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  FileText,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  WifiOff,
  AlertCircle,
} from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { ExamHeader } from "@/components/ExamHeader";
import { SubmissionOverlay } from "@/components/exam/ExamLoading";
import { PreflightModal } from "@/components/exam/PreflightModal";
import { WaitingRoom } from "@/components/exam/WaitingRoom";
import { cn } from "@/lib/utils";

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

function isHtmlEmpty(html: string): boolean {
  if (!html) return true;
  return html.replace(/<[^>]*>/g, "").trim().length === 0;
}

export default function ExamPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoaded } = useUser();
  const examCode = params.code as string;

  // --- Shared state owned by the page (used by multiple hooks) ---
  const [exam, setExam] = useState<Exam | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // UI state
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [hasOpenedQuestion, setHasOpenedQuestion] = useState(true);
  const [isQuestionVisible, setIsQuestionVisible] = useState(true);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

  // --- Hooks (called unconditionally, same order every render) ---

  // 1. Auto-save — uses page-owned sessionId
  const autoSave = useAutoSave({
    sessionId,
    examExists: !!exam,
    intervalMs: 30000,
    localStorageKey: `exam_answers_${examCode}`,
  });

  // 2. Chat — uses page-owned exam & sessionId
  const examChat = useExamChat({
    exam,
    userId: user?.id,
    sessionId,
    currentQuestion,
    scrollToBottom,
  });

  // 3. Session lifecycle — receives setters for page-owned state
  const session = useExamSession({
    examCode,
    examId: exam?.id ?? null,
    user,
    isLoaded,
    setExam,
    setSessionId,
    setDraftAnswers: autoSave.setDraftAnswers,
    setChatHistory: examChat.setChatHistory,
    saveViaBeacon: autoSave.saveViaBeacon,
  });

  // 4. Submission
  const submission = useExamSubmission({
    exam,
    examCode,
    sessionId,
    userId: user?.id,
    currentQuestion,
    draftAnswers: autoSave.draftAnswers,
    chatHistory: examChat.chatHistory,
    manualSave: autoSave.manualSave,
    setIsSubmitted: session.setIsSubmitted,
  });

  // 5. Browser guards
  useExamGuards({
    sessionId,
    exam,
    isSubmitted: session.isSubmitted,
    draftAnswers: autoSave.draftAnswers,
    user,
    examCode,
    currentQuestion,
    isOnline: autoSave.isOnline,
    setCurrentQuestion,
    setShowExitConfirm,
  });

  // --- Derived values ---
  const isMac =
    typeof window !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const saveShortcut = isMac ? (
    <>
      <Kbd>⌘</Kbd>+<Kbd>S</Kbd>
    </>
  ) : (
    <>
      <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd>
    </>
  );

  const filteredChatHistory = examChat.chatHistory.filter(
    (msg) => msg.qIdx === currentQuestion
  );

  // --- Early returns ---

  if (!isLoaded || session.examLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="animate-spin rounded-full h-16 w-16 sm:h-20 sm:w-20 border-4 border-primary border-t-transparent mx-auto"></div>
          <div className="space-y-2">
            <p className="text-lg sm:text-xl font-semibold text-foreground">
              {!isLoaded ? "사용자 인증 중..." : "시험을 불러오는 중..."}
            </p>
            <p className="text-sm sm:text-base text-muted-foreground">잠시만 기다려주세요</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-destructive" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold">로그인이 필요합니다</CardTitle>
            <CardDescription className="text-sm sm:text-base">시험을 보려면 먼저 로그인해주세요.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link
              href={`/sign-in?redirect_url=${encodeURIComponent(`/exam/${examCode}`)}`}
              onClick={() => { try { localStorage.setItem("onboarding_redirect", `/exam/${examCode}`); } catch {} }}
            >
              <Button size="lg" className="min-h-[48px] px-8">로그인하기</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-destructive" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold">시험을 찾을 수 없습니다</CardTitle>
            <CardDescription className="text-sm sm:text-base">시험 코드를 확인해주세요.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/join"><Button size="lg" className="min-h-[48px] px-8">다시 시도하기</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Preflight & Waiting Room ---

  const handlePreflightAccept = async () => {
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/session/${sessionId}/preflight`, { method: "POST" });
      if (response.ok) {
        const body = await response.json();
        session.setShowPreflight(false);

        if (body.status) {
          session.setSessionStatus(body.status);
        }

        if (body.sessionStartTime) {
          session.setSessionStartTime(body.sessionStartTime);
        }

        if (body.timeRemaining !== undefined) {
          session.setTimeRemaining(body.timeRemaining);
        }

        if (body.status === "in_progress") {
          session.setIsInWaitingRoom(false);
        } else {
          session.setIsInWaitingRoom(true);
        }
      } else {
        let errorData: Record<string, string> = {};
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          try { errorData = await response.json(); } catch {}
        } else {
          const text = await response.text().catch(() => "");
          errorData = { message: text || "알 수 없는 오류" };
        }
        toast.error(`시험 입장 확인에 실패했습니다: ${errorData.details || errorData.message || errorData.error || "알 수 없는 오류"}`);
      }
    } catch {
      toast.error("시험 입장 확인 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
  };

  const handleGateStart = (gateState: {
    sessionStatus?: string;
    sessionStartTime?: string | null;
    timeRemaining?: number | null;
  }) => {
    session.setIsInWaitingRoom(false);

    if (gateState.sessionStatus) {
      session.setSessionStatus(gateState.sessionStatus);
    } else {
      session.setSessionStatus("in_progress");
    }

    if (gateState.sessionStartTime) {
      session.setSessionStartTime(gateState.sessionStartTime);
    }

    if (gateState.timeRemaining !== undefined) {
      session.setTimeRemaining(gateState.timeRemaining);
    }

    if (sessionId) {
      queryClient.invalidateQueries({ queryKey: ["session-heartbeat", sessionId] });
    }
  };

  if (session.isSubmitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ExamHeader examCode={examCode} duration={exam.duration} currentStep="exam" user={user} />
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <Card data-testid="exam-submitted-state" className="max-w-2xl w-full shadow-xl border-0">
            <CardHeader className="text-center space-y-4 pb-6">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-green-600 dark:text-green-400" aria-hidden="true" />
              </div>
              <CardTitle className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">답안이 성공적으로 제출되었습니다!</CardTitle>
              <CardDescription className="text-sm sm:text-base">수고하셨습니다. 시험이 종료되었습니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-4">
                <p className="text-sm sm:text-base text-muted-foreground">
                  제출이 완료되었습니다. AI가 답안을 채점하고 있으며, 보통 1~2분 내에 완료됩니다.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link href={`/student/report/${sessionId}`}>
                    <Button className="min-h-[52px] px-8 text-base sm:text-lg font-semibold" size="lg">리포트 확인하기</Button>
                  </Link>
                  <Button variant="outline" onClick={() => router.push("/student")} className="min-h-[52px] px-6 text-sm sm:text-base" size="lg">
                    학생 대시보드로 돌아가기
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (session.showPreflight) {
    return (
      <>
        <PreflightModal
          open={session.showPreflight && !submission.showPreflightCancelConfirm}
          onAccept={handlePreflightAccept}
          onCancel={() => submission.setShowPreflightCancelConfirm(true)}
          examTitle={exam.title}
          examDuration={exam.duration}
          examDescription={exam.description}
        />
        <AlertDialog open={submission.showPreflightCancelConfirm} onOpenChange={submission.setShowPreflightCancelConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>시험을 취소하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                시험 입장을 취소하면 학생 대시보드로 이동합니다. 나중에 다시 시험 코드를 입력하여 입장할 수 있습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>시험에 계속 참여하기</AlertDialogCancel>
              <AlertDialogAction onClick={() => router.push("/student")} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                시험 입장 취소
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (session.isInWaitingRoom || session.sessionStatus === "waiting") {
    return (
      <WaitingRoom
        examTitle={exam.title}
        examCode={examCode}
        allowDraftInWaiting={exam.allow_draft_in_waiting || false}
        allowChatInWaiting={exam.allow_chat_in_waiting || false}
        onGateStart={handleGateStart}
        sessionId={sessionId || undefined}
        examId={exam.id}
        studentId={user.id}
        examDuration={exam.duration}
        questionCount={exam.questions?.length}
      />
    );
  }

  // --- Main exam UI ---

  return (
    <SidebarProvider
      defaultOpen={true}
      className="flex-row-reverse"
      style={{ "--sidebar-width": "40vw", "--sidebar-width-icon": "3rem" } as React.CSSProperties & { [key: string]: string }}
    >
      <ExamChatSidebar
        chatHistory={filteredChatHistory}
        chatMessage={examChat.chatMessage}
        setChatMessage={examChat.setChatMessage}
        sendChatMessage={examChat.sendChatMessage}
        isLoading={examChat.isLoading}
        isTyping={examChat.isTyping}
        sessionError={session.sessionError}
        setSessionError={session.setSessionError}
        chatEndRef={chatEndRef}
        currentQuestion={currentQuestion}
      />

      <SidebarInset className="flex-1 min-h-0 overflow-hidden transition-all duration-75 ease-out">
        <div className="h-screen flex flex-col bg-background">
          <SubmissionOverlay isSubmitting={submission.isSubmitting} />
          {!autoSave.isOnline && (
            <div className="bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>네트워크 연결이 끊어졌습니다. 연결이 복원되면 답안이 자동 저장됩니다.</span>
            </div>
          )}

          <ExamHeader
            examCode={examCode}
            duration={exam.duration}
            currentStep="exam"
            user={user}
            disableLogoLink
            sessionStartTime={session.sessionStartTime}
            timeRemaining={session.timeRemaining}
            onTimeExpired={async () => {
              if (!sessionId || !exam || session.isSubmitted) return;
              await submission.handleTimeExpired();
            }}
            onExit={() => setShowExitConfirm(true)}
          />

          <MainContentWrapper>
            <div className="bg-background h-full flex flex-col">
              {/* Top Bar */}
              <div className="sticky top-0 z-[5] border-b border-border p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-background/95 backdrop-blur-sm shadow-sm">
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  <Button
                    variant={hasOpenedQuestion ? "outline" : "default"}
                    onClick={() => { setIsQuestionVisible(!isQuestionVisible); if (!hasOpenedQuestion) setHasOpenedQuestion(true); }}
                    className={cn(
                      "gap-2 transition-all duration-300 min-h-[44px] px-4",
                      !hasOpenedQuestion && "animate-pulse ring-2 ring-blue-500/50 ring-offset-2 shadow-lg shadow-blue-200/50 font-semibold",
                      hasOpenedQuestion
                        ? "bg-background text-foreground border-border hover:bg-muted"
                        : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/50"
                    )}
                    aria-label={isQuestionVisible ? "문제 접기" : "문제 보기"}
                    aria-expanded={isQuestionVisible}
                  >
                    <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="text-sm sm:text-base">{isQuestionVisible ? "문제 접기" : "문제 보기"}</span>
                    {isQuestionVisible
                      ? <ChevronUp className="w-4 h-4 opacity-50 shrink-0" aria-hidden="true" />
                      : <ChevronDown className="w-4 h-4 opacity-50 shrink-0" aria-hidden="true" />}
                  </Button>
                  <h2 className="text-sm sm:text-base font-semibold text-foreground truncate max-w-[200px] sm:max-w-none">{exam.title}</h2>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setCurrentQuestion((prev) => Math.max(0, prev - 1))} disabled={currentQuestion === 0} className="h-8 w-8 shrink-0" aria-label="이전 문제">←</Button>
                    <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar">
                      {exam.questions.map((_, idx) => {
                        const isCurrent = idx === currentQuestion;
                        const hasAnswer = !isHtmlEmpty(autoSave.draftAnswers[idx]?.text || "");
                        const hasChat = examChat.chatHistory.some((msg) => msg.qIdx === idx);
                        return (
                          <button
                            key={idx}
                            onClick={() => setCurrentQuestion(idx)}
                            className={cn(
                              "w-10 h-10 sm:w-8 sm:h-8 rounded-full text-xs font-medium border transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 relative",
                              isCurrent ? "ring-2 ring-primary bg-primary text-primary-foreground border-primary"
                                : hasAnswer ? "bg-primary/15 border-primary/30 text-primary hover:bg-primary/25"
                                : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                            )}
                            aria-label={`문제 ${idx + 1}${isCurrent ? " (현재)" : ""}${hasAnswer ? " (작성됨)" : " (미작성)"}${hasChat ? " (채팅 있음)" : ""}`}
                          >
                            {idx + 1}
                            {hasChat && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full border border-background" />}
                          </button>
                        );
                      })}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setCurrentQuestion((prev) => Math.min(exam.questions.length - 1, prev + 1))} disabled={currentQuestion === exam.questions.length - 1} className="h-8 w-8 shrink-0" aria-label="다음 문제">→</Button>
                  </div>
                  <Button
                    onClick={submission.handleSubmitClick}
                    disabled={submission.isSubmitting}
                    className="min-h-[44px] sm:min-h-[48px] text-sm sm:text-base font-semibold shadow-md hover:shadow-lg transition-all duration-200 px-4 sm:px-6"
                    size="lg"
                    aria-label="시험 제출하기"
                  >
                    {submission.isSubmitting ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground border-t-transparent mr-2"></div>제출 중...</>
                    ) : "시험 제출하기"}
                  </Button>
                </div>
              </div>

              {/* Question & Answer */}
              {isQuestionVisible ? (
                <ResizablePanelGroup direction="vertical" className="flex-1 min-h-0">
                  <ResizablePanel defaultSize={40} minSize={20} maxSize={70}>
                    <QuestionPanel question={exam.questions[currentQuestion]} questionNumber={currentQuestion + 1} rubric={exam.rubric} rubricPublic={exam.rubric_public} />
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={60} minSize={30}>
                    <AnswerPanel
                      value={autoSave.draftAnswers[currentQuestion]?.text || ""}
                      onChange={(value) => autoSave.updateAnswer(exam.questions[currentQuestion].id, value)}
                      onPaste={submission.handlePaste}
                      isSaving={autoSave.isSaving}
                      lastSaved={autoSave.lastSaved}
                      saveError={autoSave.saveError}
                      saveShortcut={saveShortcut}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                <AnswerPanel
                  value={autoSave.draftAnswers[currentQuestion]?.text || ""}
                  onChange={(value) => autoSave.updateAnswer(exam.questions[currentQuestion].id, value)}
                  onPaste={submission.handlePaste}
                  isSaving={autoSave.isSaving}
                  lastSaved={autoSave.lastSaved}
                  saveError={autoSave.saveError}
                  saveShortcut={saveShortcut}
                  fullHeight
                />
              )}
            </div>
          </MainContentWrapper>

          <SubmitConfirmDialog open={submission.showSubmitConfirm} onOpenChange={submission.setShowSubmitConfirm} onConfirm={submission.handleSubmit} />
        </div>
      </SidebarInset>

      <ExamDialogs
        showExitConfirm={showExitConfirm}
        setShowExitConfirm={setShowExitConfirm}
        onExitConfirm={async () => { await autoSave.manualSave(); router.push("/student"); }}
        unansweredDialog={submission.unansweredDialog}
        setUnansweredDialog={submission.setUnansweredDialog}
        setCurrentQuestion={setCurrentQuestion}
        setShowSubmitConfirm={submission.setShowSubmitConfirm}
        autoSubmitFailed={submission.autoSubmitFailed}
        setAutoSubmitFailed={submission.setAutoSubmitFailed}
        onAutoSubmitRetry={() => { submission.setAutoSubmitFailed(false); submission.handleSubmit(); }}
        onAutoSubmitExit={async () => { await autoSave.manualSave(); router.push("/student"); }}
        manualSubmitFailed={submission.manualSubmitFailed}
        setManualSubmitFailed={submission.setManualSubmitFailed}
        onManualSubmitRetry={() => { submission.setManualSubmitFailed(false); submission.handleSubmit(); }}
        submitErrorMessage={submission.submitErrorMessage}
      />
    </SidebarProvider>
  );
}
