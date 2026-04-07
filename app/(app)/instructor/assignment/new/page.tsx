"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Presentation,
  FileSpreadsheet,
  FileImage,
  File,
  ClipboardList,
} from "lucide-react";
import toast from "react-hot-toast";
import { extractErrorMessage } from "@/lib/error-messages";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExamInfoForm } from "@/components/instructor/ExamInfoForm";
import { FileUpload } from "@/components/instructor/FileUpload";
import {
  RubricTable,
  type RubricItem,
} from "@/components/instructor/RubricTable";
import { QuestionsList } from "@/components/instructor/QuestionsList";
import type { Question } from "@/components/instructor/QuestionEditor";
import { CaseQuestionGenerator } from "@/components/instructor/CaseQuestionGenerator";
import {
  ScrollProgressProvider,
  ScrollProgress,
} from "@/components/animate-ui/primitives/animate/scroll-progress";
import { useFileUpload } from "@/hooks/useFileUpload";

function isQuestionContentEmpty(text: string): boolean {
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}

export default function CreateAssignment() {
  const router = useRouter();
  const { user, isLoaded, isSignedIn } = useUser();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [createdExamCode, setCreatedExamCode] = useState("");

  const [examData, setExamData] = useState({
    title: "",
    duration: 0,
    code: "",
    deadline: "",
    materials: [] as File[],
  });
  const [disabledFiles, setDisabledFiles] = useState<Set<number>>(new Set());
  const [canAddMoreFiles, setCanAddMoreFiles] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [rubric, setRubric] = useState<RubricItem[]>([]);
  const [pendingRubricSuggestions, setPendingRubricSuggestions] = useState<RubricItem[]>([]);
  const [isRubricPublic, setIsRubricPublic] = useState(false);
  const [chatWeight, setChatWeight] = useState<number | null>(null);
  const fileUpload = useFileUpload();
  const questionsListRef = useRef<HTMLDivElement>(null);
  const examInfoRef = useRef<HTMLDivElement>(null);
  const [highlightedQuestionIds, setHighlightedQuestionIds] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; deadline?: string; questions?: string }>({});
  const [isAIGeneratingRubric, setIsAIGeneratingRubric] = useState(false);

  const generateExamCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setExamData((prev) => ({ ...prev, code: result }));
  };

  const calculateTotalSize = (files: File[]) => {
    return files.reduce((total, file) => total + file.size, 0);
  };

  const validateAndManageFileSize = (files: File[]) => {
    const MAX_SIZE = 50 * 1024 * 1024;
    const totalSize = calculateTotalSize(files);
    if (totalSize <= MAX_SIZE) {
      setDisabledFiles(new Set());
      setCanAddMoreFiles(true);
      return true;
    }
    setCanAddMoreFiles(false);
    toast.error("파일 용량이 50MB를 초과했습니다.");
    return false;
  };

  useEffect(() => {
    generateExamCode();
  }, []);

  const validateFile = (file: File): boolean => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    const maxSize = 50 * 1024 * 1024;
    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = ["pdf", "ppt", "pptx", "doc", "docx", "xls", "xlsx", "csv", "hwp", "hwpx", "jpg", "jpeg", "png", "gif", "webp"];
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(extension || "")) {
      toast.error("지원되지 않는 파일 형식입니다.");
      return false;
    }
    if (file.size > maxSize) {
      toast.error("파일 크기가 50MB를 초과합니다.");
      return false;
    }
    return true;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canAddMoreFiles) { e.target.value = ""; return; }
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(validateFile);
    if (validFiles.length === 0) { e.target.value = ""; return; }
    const newMaterials = [...examData.materials, ...validFiles];
    validateAndManageFileSize(newMaterials);
    setExamData((prev) => ({ ...prev, materials: newMaterials }));
    validFiles.forEach((file) => fileUpload.upload(file));
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (canAddMoreFiles) setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    if (!canAddMoreFiles) return;
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(validateFile);
    if (validFiles.length === 0) return;
    const newMaterials = [...examData.materials, ...validFiles];
    validateAndManageFileSize(newMaterials);
    setExamData((prev) => ({ ...prev, materials: newMaterials }));
    validFiles.forEach((file) => fileUpload.upload(file));
  };
  const handleDragAreaClick = () => { if (canAddMoreFiles) document.getElementById("materials")?.click(); };
  const removeFile = (index: number) => {
    const removedFile = examData.materials[index];
    const newMaterials = examData.materials.filter((_, i) => i !== index);
    validateAndManageFileSize(newMaterials);
    setExamData((prev) => ({ ...prev, materials: newMaterials }));
    if (removedFile) fileUpload.removeFile(removedFile.name);
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    const iconClass = "w-4 h-4 shrink-0";
    switch (extension) {
      case "pdf": return <FileText className={`${iconClass} text-red-500`} />;
      case "ppt": case "pptx": return <Presentation className={`${iconClass} text-orange-500`} />;
      case "doc": case "docx": return <FileText className={`${iconClass} text-blue-500`} />;
      case "xls": case "xlsx": case "csv": return <FileSpreadsheet className={`${iconClass} text-green-500`} />;
      case "hwp": case "hwpx": return <ClipboardList className={`${iconClass} text-sky-500`} />;
      case "jpg": case "jpeg": case "png": case "gif": case "webp": return <FileImage className={`${iconClass} text-purple-500`} />;
      default: return <File className={`${iconClass} text-muted-foreground`} />;
    }
  };

  const updateQuestion = (id: string, field: keyof Question, value: string | boolean) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
  };
  const addQuestion = () => {
    setQuestions((prev) => [...prev, { id: Date.now().toString() + Math.random().toString(36).slice(2), text: "", type: "essay" as const }]);
  };
  const moveQuestion = (index: number, direction: "up" | "down") => {
    setQuestions((prev) => {
      const n = [...prev]; const t = direction === "up" ? index - 1 : index + 1;
      if (t < 0 || t >= n.length) return prev;
      [n[index], n[t]] = [n[t], n[index]]; return n;
    });
  };
  const addRubricItem = () => { setRubric([...rubric, { id: Date.now().toString(), evaluationArea: "", detailedCriteria: "" }]); };
  const updateRubricItem = (id: string, field: keyof RubricItem, value: string) => { setRubric(rubric.map((item) => (item.id === id ? { ...item, [field]: value } : item))); };
  const removeRubricItem = (id: string) => { setRubric(rubric.filter((item) => item.id !== id)); };

  const handleAIGenerateRubric = useCallback(async (params?: { topics?: string; customInstructions?: string }) => {
    if (questions.length === 0 || questions.every((q) => isQuestionContentEmpty(q.text))) {
      toast.error("AI 루브릭을 생성하려면 문제를 먼저 작성해주세요."); return;
    }
    if (!examData.title.trim()) { toast.error("AI 루브릭을 생성하려면 제목을 먼저 입력해주세요."); return; }
    setIsAIGeneratingRubric(true);
    try {
      const response = await fetch("/api/ai/generate-rubric", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examTitle: examData.title,
          questions: questions.filter((q) => !isQuestionContentEmpty(q.text)).map((q) => ({ text: q.text, type: q.type })),
          ...(params?.topics ? { topics: params.topics } : {}),
        }),
      });
      if (!response.ok) throw new Error("루브릭 생성에 실패했습니다.");
      const result = await response.json();
      if (result.rubric && Array.isArray(result.rubric)) {
        setPendingRubricSuggestions(result.rubric.map((r: { evaluationArea: string; detailedCriteria: string }) => ({
          id: Date.now().toString() + Math.random().toString(36).slice(2), evaluationArea: r.evaluationArea, detailedCriteria: r.detailedCriteria,
        })));
        toast.success("AI 평가 기준이 제안되었습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "루브릭 생성 중 오류가 발생했습니다.");
    } finally { setIsAIGeneratingRubric(false); }
  }, [examData.title, questions]);

  const createAssignmentMutation = useMutation({
    mutationFn: async (dataForDB: Record<string, unknown>) => {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_assignment", data: dataForDB }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractErrorMessage(errorData, "과제 생성에 실패했습니다", response.status));
      }
      return await response.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qk.instructor.exams() }); },
  });

  const isSubmittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const errors: { title?: string; deadline?: string; questions?: string } = {};
    if (!examData.title.trim()) errors.title = "과제 제목을 입력해주세요";
    if (!examData.deadline) errors.deadline = "제출 기한을 선택해주세요";
    if (questions.length === 0) {
      errors.questions = "최소 1개 이상의 문제를 추가해주세요";
    } else {
      const emptyIndices = questions.map((q, i) => (isQuestionContentEmpty(q.text) ? i + 1 : -1)).filter((i) => i !== -1);
      if (emptyIndices.length > 0) {
        errors.questions = emptyIndices.length === questions.length ? "문제 내용을 입력해주세요" : `${emptyIndices.join(", ")}번 문제가 비어있습니다`;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      isSubmittingRef.current = false;
      if (errors.title || errors.deadline) {
        examInfoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (errors.questions) {
        questionsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    setFieldErrors({});

    setIsLoading(true);
    try {
      const materialUrls = fileUpload.getUploadedUrls();
      const materialsText = fileUpload.getMaterialsText();
      // date input gives "YYYY-MM-DD", auto-set to 23:59 KST
      const deadlineDate = new Date(examData.deadline + "T23:59:00+09:00");
      const deadlineISO = deadlineDate.toISOString();

      const dataForDB = {
        title: examData.title,
        code: examData.code,
        deadline: deadlineISO,
        close_at: deadlineISO,
        questions: questions,
        rubric: rubric,
        rubric_public: isRubricPublic,
        chat_weight: chatWeight,
        materials: materialUrls,
        materials_text: materialsText,
        status: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        type: "report",
      };

      await createAssignmentMutation.mutateAsync(dataForDB);
      setCreatedExamCode(examData.code);
      setIsDialogOpen(true);
    } catch {
      toast.error("과제 생성 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  if (!isLoaded || !isSignedIn || !user) {
    return null;
  }

  return (
    <ScrollProgressProvider global transition={{ stiffness: 150, damping: 30, bounce: 0 }}>
      <div className="fixed top-4 left-0 right-0 z-50 px-4">
        <div className="max-w-4xl mx-auto">
          <ScrollProgress className="h-1.5 bg-primary rounded-full" mode="width" />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2 w-full justify-between">
              <h1 className="text-3xl font-bold">새로운 과제 만들기</h1>
              <Button type="button" variant="outline" onClick={() => router.push("/instructor")} className="min-h-[44px] gap-2 border-border hover:bg-muted hover:text-foreground">
                <ArrowLeft className="w-4 h-4" />
                대시보드
              </Button>
            </div>
            <p className="text-muted-foreground">AI 캔버스가 포함된 과제를 구성하세요</p>
          </div>

          <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") e.preventDefault(); }} className="space-y-6">
            <div ref={examInfoRef}>
              <ExamInfoForm
                title={examData.title}
                code={examData.code}
                duration={examData.duration}
                onTitleChange={(value) => { setExamData((prev) => ({ ...prev, title: value })); setFieldErrors((prev) => ({ ...prev, title: undefined })); }}
                onCodeChange={(value) => setExamData((prev) => ({ ...prev, code: value }))}
                onDurationChange={(value) => setExamData((prev) => ({ ...prev, duration: value }))}
                onGenerateCode={generateExamCode}
                mode="assignment"
                deadline={examData.deadline}
                onDeadlineChange={(value) => { setExamData((prev) => ({ ...prev, deadline: value })); setFieldErrors((prev) => ({ ...prev, deadline: undefined })); }}
                titleError={fieldErrors.title}
                deadlineError={fieldErrors.deadline}
              />
            </div>

            <FileUpload
              files={examData.materials}
              disabledFiles={disabledFiles}
              canAddMoreFiles={canAddMoreFiles}
              isDragOver={isDragOver}
              totalSize={calculateTotalSize(examData.materials)}
              onFileSelect={handleFileSelect}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragAreaClick={handleDragAreaClick}
              onRemoveFile={removeFile}
              getFileIcon={getFileIcon}
              extractionStatus={fileUpload.fileStatus}
            />

            <CaseQuestionGenerator
              examTitle={examData.title}
              extractedTexts={fileUpload.extractedTexts}
              extractionStatus={fileUpload.fileStatus}
              onQuestionsAccepted={(newQuestions) => {
                const newIds = newQuestions.map((q) => q.id);
                setQuestions((prev) => {
                  const nonEmpty = prev.filter((q) => q.text.replace(/<[^>]*>/g, "").trim() !== "");
                  return [...nonEmpty, ...newQuestions.map((q) => ({ id: q.id, text: q.text, type: q.type as "essay" | "short-answer" | "multiple-choice", rubric: q.rubric }))];
                });
                setHighlightedQuestionIds(new Set(newIds));
                setTimeout(() => setHighlightedQuestionIds(new Set()), 3000);
                setTimeout(() => questionsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
              }}
              onRubricSuggested={(newRubric) => {
                setPendingRubricSuggestions(newRubric.map((r) => ({
                  id: Date.now().toString() + Math.random().toString(36).slice(2), evaluationArea: r.evaluationArea, detailedCriteria: r.detailedCriteria,
                })));
              }}
            />

            <div ref={questionsListRef} className={fieldErrors.questions ? "rounded-lg ring-2 ring-red-500 ring-offset-2" : ""}>
              {fieldErrors.questions && (
                <p className="text-xs text-red-500 mb-2 px-1">{fieldErrors.questions}</p>
              )}
              <QuestionsList
                questions={questions}
                highlightedIds={highlightedQuestionIds}
                defaultOpen={false}
                mode="assignment"
                onUpdate={(id, field, value) => { updateQuestion(id, field, value); setFieldErrors((prev) => ({ ...prev, questions: undefined })); }}
                onRemove={(id) => setQuestions((prev) => prev.filter((q) => q.id !== id))}
                onAdd={() => { addQuestion(); setFieldErrors((prev) => ({ ...prev, questions: undefined })); }}
                onMove={moveQuestion}
              />
            </div>

            <RubricTable
              rubric={rubric}
              onAdd={addRubricItem}
              onUpdate={updateRubricItem}
              onRemove={removeRubricItem}
              isPublic={isRubricPublic}
              onPublicChange={setIsRubricPublic}
              chatWeight={chatWeight}
              onChatWeightChange={setChatWeight}
              onAIGenerate={handleAIGenerateRubric}
              isAIGenerating={isAIGeneratingRubric}
              pendingAISuggestions={pendingRubricSuggestions}
              onAcceptAISuggestions={() => {
                setRubric((prev) => {
                  const nonEmpty = prev.filter((r) => r.evaluationArea.trim() !== "" || r.detailedCriteria.trim() !== "");
                  return [...nonEmpty, ...pendingRubricSuggestions];
                });
                setPendingRubricSuggestions([]);
                toast.success("AI 루브릭이 적용되었습니다.");
              }}
              onDismissAISuggestions={() => setPendingRubricSuggestions([])}
            />

            <div className="space-y-2">
              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => router.push("/instructor")}>취소</Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "생성 중..." : "과제 출제하기"}
                </Button>
              </div>
            </div>
          </form>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>과제 생성 완료</DialogTitle>
                <DialogDescription>과제가 성공적으로 생성되었습니다.</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">과제 코드</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="px-4 py-2 bg-muted rounded-md exam-code text-lg font-semibold">{createdExamCode}</code>
                      <Button type="button" variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(createdExamCode); toast.success("과제 코드가 복사되었습니다.", { id: "copy-code" }); }}>
                        복사
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">이 코드를 학생들에게 공유하세요.</p>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1 border-t pt-3">
                    <p>문제 {questions.length}개{examData.materials.length > 0 && ` · 자료 ${examData.materials.length}개`}</p>
                    <p>제출 기한: {examData.deadline ? `${examData.deadline} 23:59까지` : "-"}</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => { setIsDialogOpen(false); router.push("/instructor"); }}>확인</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </ScrollProgressProvider>
  );
}
