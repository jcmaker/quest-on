"use client";

import { use, useState, useCallback, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { AssignmentHeader } from "@/components/assignment/AssignmentHeader";
import { AssignmentChatPanel } from "@/components/assignment/AssignmentChatPanel";
import { AssignmentCanvas } from "@/components/assignment/AssignmentCanvas";
import { AssignmentSubmitDialog } from "@/components/assignment/AssignmentSubmitDialog";
import { HybridWorkspace } from "@/components/canvas/HybridWorkspace";
import { useAssignmentSession } from "@/hooks/useAssignmentSession";
import { useAssignmentChat } from "@/hooks/useAssignmentChat";
import { useCanvasAutoSave } from "@/hooks/useCanvasAutoSave";
import { Loader2, AlertCircle, FileX } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { marked } from "marked";
import toast from "react-hot-toast";
import type { WorkspaceState, CanvasConfig, InitialState } from "@/lib/types/workspace";
import { createDefaultWorkspaceState } from "@/lib/types/workspace";

export default function AssignmentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const resolvedParams = use(params);
  const code = resolvedParams.code;
  const router = useRouter();

  const {
    exam,
    session,
    isLoading: isSessionLoading,
    error,
    canvasContent,
    setCanvasContent,
    userId,
  } = useAssignmentSession(code);

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);

  // Hybrid workspace state
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState | null>(null);
  const workspaceInitialized = useRef(false);

  // Determine if this is a hybrid workspace assignment
  const examRecord = exam as unknown as Record<string, unknown> | null;
  const examType = examRecord?.type as string | undefined;
  const canvasConfig = examRecord?.canvas_config as CanvasConfig | undefined;
  const initialState = examRecord?.initial_state as InitialState | undefined;
  const isHybridWorkspace =
    examType === "code" ||
    examType === "erd" ||
    examType === "mindmap" ||
    canvasConfig?.secondaryCanvas === true;

  // Initialize workspace state from initial_state on first load
  useEffect(() => {
    if (!isHybridWorkspace || workspaceInitialized.current) return;
    workspaceInitialized.current = true;

    // Try to load existing workspace_state from submission (if resuming)
    // For now, initialize from exam's initial_state
    setWorkspaceState(createDefaultWorkspaceState(initialState));
  }, [isHybridWorkspace, initialState]);

  // Detect if already submitted
  useEffect(() => {
    if (session?.submitted_at || session?.status === "submitted") {
      setIsSubmitted(true);
    }
  }, [session]);

  // Open canvas if there's existing content on load
  useEffect(() => {
    if (canvasContent && canvasContent.replace(/<[^>]*>/g, "").trim().length > 0) {
      setIsCanvasOpen(true);
    }
  }, [canvasContent]);

  // Convert markdown from AI to HTML for TipTap
  const handleCanvasUpdate = useCallback(
    (markdownContent: string) => {
      try {
        const html = marked.parse(markdownContent, { async: false }) as string;
        setCanvasContent(html);
      } catch {
        setCanvasContent(`<p>${markdownContent}</p>`);
      }
    },
    [setCanvasContent]
  );

  const handleCanvasOpen = useCallback(() => {
    setIsCanvasOpen(true);
  }, []);

  const {
    messages,
    setMessages,
    isLoading: isChatLoading,
    sendMessage,
  } = useAssignmentChat({
    sessionId: session?.id || "",
    examId: exam?.id || "",
    studentId: userId,
    onCanvasUpdate: handleCanvasUpdate,
    onCanvasOpen: handleCanvasOpen,
  });

  // Load existing messages when session initializes
  useEffect(() => {
    if (!session?.id) return;
    const loadMessages = async () => {
      try {
        const res = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_session_messages",
            data: { sessionId: session.id },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const existingMsgs = data.messages || [];
          if (existingMsgs.length > 0) {
            setMessages(
              existingMsgs.map(
                (m: { id: string; role: string; content: string }) => {
                  const isAssistant = m.role === "ai";
                  const hasCanvas =
                    isAssistant && m.content.includes("<!-- CANVAS_START -->");
                  return {
                    id: m.id,
                    role: isAssistant ? "assistant" as const : "user" as const,
                    content: m.content,
                    isStreaming: false,
                    hasCanvasUpdate: hasCanvas,
                  };
                }
              )
            );
          }
        }
      } catch {
        // Non-critical
      }
    };
    loadMessages();
  }, [session?.id, setMessages]);

  // Auto-save canvas (includes workspace_state for hybrid assignments)
  useCanvasAutoSave({
    sessionId: session?.id || "",
    content: canvasContent,
    enabled: !!session?.id && !isSubmitted,
    workspaceState: workspaceState ?? undefined,
  });

  // Auto-submit when deadline expires
  const handleDeadlineExpired = useCallback(async () => {
    if (isSubmitted || isSubmitting) return;
    if (!session?.id || !exam?.id || !userId) return;
    toast("마감 시간이 지났습니다. 자동 제출합니다.", { icon: "\u23F0" });
    // Trigger submit directly
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_assignment",
          data: {
            sessionId: session.id,
            examId: exam.id,
            studentId: userId,
            canvasContent: canvasContent,
            ...(workspaceState ? { workspace_state: workspaceState } : {}),
          },
        }),
      });
      if (res.ok || res.status === 409) {
        setIsSubmitted(true);
        toast.success("과제가 자동 제출되었습니다.");
      }
    } catch {
      // Silent — deadline already passed
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitted, isSubmitting, session?.id, exam?.id, userId, canvasContent, workspaceState]);

  // Handle submit
  const handleSubmit = async () => {
    if (!session?.id || !exam?.id || !userId) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_assignment",
          data: {
            sessionId: session.id,
            examId: exam.id,
            studentId: userId,
            canvasContent: canvasContent,
            ...(workspaceState ? { workspace_state: workspaceState } : {}),
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "제출에 실패했습니다.");
      }

      setIsSubmitted(true);
      setShowSubmitDialog(false);
      toast.success("과제가 성공적으로 제출되었습니다.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "제출 중 오류가 발생했습니다."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isSessionLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">과제를 불러오는 중...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-xl font-bold">과제에 입장할 수 없습니다</CardTitle>
            <CardDescription className="text-sm">{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button size="lg" className="min-h-[48px] px-8" onClick={() => router.push("/")}>
              돌아가기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!exam || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
              <FileX className="w-8 h-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-xl font-bold">과제를 찾을 수 없습니다</CardTitle>
            <CardDescription className="text-sm">과제 코드를 확인하거나 강사에게 문의해주세요.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button size="lg" className="min-h-[48px] px-8" onClick={() => router.push("/")}>
              돌아가기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasCanvasContent =
    canvasContent.replace(/<[^>]*>/g, "").trim().length > 0;

  // Hybrid workspace rendering
  if (isHybridWorkspace && workspaceState && canvasConfig) {
    return (
      <div className="flex flex-col h-screen">
        <AssignmentHeader
          title={exam.title}
          deadline={exam.deadline}
          isSubmitted={isSubmitted}
          onSubmit={() => setShowSubmitDialog(true)}
          isSubmitting={isSubmitting}
          onDeadlineExpired={handleDeadlineExpired}
        />

        <div className="flex-1 overflow-hidden">
          <HybridWorkspace
            workspaceState={workspaceState}
            canvasConfig={canvasConfig}
            onWorkspaceChange={setWorkspaceState}
            readOnly={isSubmitted}
            chatPanel={
              <AssignmentChatPanel
                messages={messages}
                isLoading={isChatLoading}
                onSendMessage={sendMessage}
                isSubmitted={isSubmitted}
                assignmentPrompt={exam.assignment_prompt || ""}
                questions={(exam.questions || []) as { id: string; text: string; type: string }[]}
                onOpenCanvas={handleCanvasOpen}
                isCanvasOpen={true}
              />
            }
          />
        </div>

        <AssignmentSubmitDialog
          open={showSubmitDialog}
          onOpenChange={setShowSubmitDialog}
          onConfirm={handleSubmit}
          isSubmitting={isSubmitting}
          hasCanvasContent={hasCanvasContent}
        />
      </div>
    );
  }

  // Default TipTap canvas rendering (report type / backward compatible)
  return (
    <div className="flex flex-col h-screen">
      <AssignmentHeader
        title={exam.title}
        deadline={exam.deadline}
        isSubmitted={isSubmitted}
        onSubmit={() => setShowSubmitDialog(true)}
        isSubmitting={isSubmitting}
        onDeadlineExpired={handleDeadlineExpired}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Chat Panel */}
        <motion.div
          className="flex flex-col overflow-hidden"
          animate={{ flex: isCanvasOpen ? "0 0 60%" : "1 1 100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <AssignmentChatPanel
            messages={messages}
            isLoading={isChatLoading}
            onSendMessage={sendMessage}
            isSubmitted={isSubmitted}
            assignmentPrompt={exam.assignment_prompt || ""}
            questions={(exam.questions || []) as { id: string; text: string; type: string }[]}
            onOpenCanvas={handleCanvasOpen}
            isCanvasOpen={isCanvasOpen}
          />
        </motion.div>

        {/* Canvas Panel — always mounted, width animates 0 ↔ 40% */}
        <motion.div
          className="flex flex-col overflow-hidden border-l"
          initial={false}
          animate={{
            width: isCanvasOpen ? "40%" : "0%",
            opacity: isCanvasOpen ? 1 : 0,
          }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          style={{ minWidth: 0 }}
        >
          <AssignmentCanvas
            content={canvasContent}
            onChange={setCanvasContent}
            isSubmitted={isSubmitted}
            onClose={() => setIsCanvasOpen(false)}
            title={exam.title}
            examType={examType}
          />
        </motion.div>
      </div>

      <AssignmentSubmitDialog
        open={showSubmitDialog}
        onOpenChange={setShowSubmitDialog}
        onConfirm={handleSubmit}
        isSubmitting={isSubmitting}
        hasCanvasContent={hasCanvasContent}
      />
    </div>
  );
}
