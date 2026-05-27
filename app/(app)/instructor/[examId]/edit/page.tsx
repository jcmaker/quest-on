"use client";

import { useState, useEffect, useCallback, use, useRef, useMemo } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { extractErrorMessage, getErrorMessage } from "@/lib/error-messages";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import {
  AlertTriangle,
  ArrowLeft,
  FileText,
  Presentation,
  FileSpreadsheet,
  FileImage,
  File,
  ClipboardList,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { FileUpload } from "@/components/instructor/FileUpload";
import { QuestionsList } from "@/components/instructor/QuestionsList";
import type { Question } from "@/components/instructor/QuestionEditor";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useBulkQuestionGeneration } from "@/hooks/useBulkQuestionGeneration";

// ─── Field 컴포넌트 (시험 만들기와 동일한 패턴) ─────────────────────────────

function Field({
  label,
  htmlFor,
  required,
  optional,
  helper,
  action,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  helper?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label
            htmlFor={htmlFor}
            className="flex items-center gap-1.5 text-base font-semibold"
          >
            {label}
            {required && (
              <span className="text-destructive" aria-hidden>
                *
              </span>
            )}
            {optional && (
              <span className="text-xs font-normal text-muted-foreground">
                선택
              </span>
            )}
          </Label>
          {helper && <p className="text-sm text-muted-foreground">{helper}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

// ─── 유형 변환 헬퍼 ─────────────────────────────────────────────────────────

function toApiType(q: Question["type"]): "mcq" | "true-false" | "case" {
  if (q === "multiple-choice") return "mcq";
  if (q === "true-false") return "true-false";
  return "case";
}

// ─── 문제 유형 선택기 ────────────────────────────────────────────────────────

const QUESTION_TYPE_OPTIONS: {
  type: Question["type"];
  label: string;
  description: string;
}[] = [
  { type: "multiple-choice", label: "사지선다", description: "4지선다 객관식" },
  { type: "true-false", label: "O·X", description: "참·거짓 O/X" },
  { type: "essay", label: "사례형", description: "서술형 사례" },
];

function QuestionTypePicker({
  value,
  onChange,
}: {
  value: Question["type"];
  onChange: (type: Question["type"]) => void;
}) {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const currentIndex = QUESTION_TYPE_OPTIONS.findIndex((o) => o.type === value);
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      (currentIndex + delta + QUESTION_TYPE_OPTIONS.length) %
      QUESTION_TYPE_OPTIONS.length;
    const next = QUESTION_TYPE_OPTIONS[nextIndex];
    onChange(next.type);
    document.getElementById(`edit-question-type-${next.type}`)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="문제 유형"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {QUESTION_TYPE_OPTIONS.map((option) => {
        const isSelected = value === option.type;
        return (
          <button
            key={option.type}
            id={`edit-question-type-${option.type}`}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(option.type)}
            onKeyDown={handleKeyDown}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:aspect-square ${
              isSelected
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            }`}
          >
            <span className="text-base font-semibold">{option.label}</span>
            <span className="text-xs text-muted-foreground">
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── 빈 문제 내용 체크 ───────────────────────────────────────────────────────

function isQuestionContentEmpty(text: string): boolean {
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}

// ─── 페이지 ─────────────────────────────────────────────────────────────────

export default function EditExam({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { user, isLoaded } = useAppUser();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingExam, setIsLoadingExam] = useState(true);
  const [examData, setExamData] = useState({
    title: "",
    duration: 60,
    code: "",
    materials: [] as File[],
    language: "ko" as "ko" | "en",
  });
  const [disabledFiles, setDisabledFiles] = useState<Set<number>>(new Set());
  const [canAddMoreFiles, setCanAddMoreFiles] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [chatWeight, setChatWeight] = useState<number | null>(null);
  const [showAdvancedGrading, setShowAdvancedGrading] = useState(false);
  const fileUpload = useFileUpload();
  const isSubmittingRef = useRef(false);
  // 무제한 토글 OFF 시 이전 duration 복원용
  const prevDurationRef = useRef<number>(60);

  // 문제 추가 Dialog 상태
  const [isAddPickerOpen, setIsAddPickerOpen] = useState(false);
  const [pickedType, setPickedType] = useState<Question["type"]>("multiple-choice");
  const [pickedCount, setPickedCount] = useState(1);
  const [pickedPrompt, setPickedPrompt] = useState("");

  const {
    generateAll,
    groupResults,
    isLoading: isBulkGenerating,
    reset: resetBulk,
  } = useBulkQuestionGeneration();

  // ── 기존 시험 데이터 로드 ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchExam = async () => {
      if (!isLoaded || !user) return;
      try {
        setIsLoadingExam(true);
        const response = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_exam_by_id",
            data: { id: resolvedParams.examId },
          }),
        });
        if (!response.ok) throw new Error("시험 데이터를 불러올 수 없습니다.");
        const result = await response.json();
        const exam = result.exam;
        setExamData({
          title: exam.title || "",
          duration: exam.duration || 60,
          code: exam.code || "",
          materials: [],
          language: (exam.language === "en" ? "en" : "ko") as "ko" | "en",
        });
        setQuestions(exam.questions || []);
        const loadedWeight = exam.chat_weight ?? null;
        setChatWeight(loadedWeight);
        if (loadedWeight !== null) setShowAdvancedGrading(true);
        fileUpload.initExistingData(exam.materials || [], exam.materials_text);
      } catch {
        toast.error("시험 데이터를 불러오는 중 오류가 발생했습니다.");
        router.push(`/instructor/${resolvedParams.examId}`);
      } finally {
        setIsLoadingExam(false);
      }
    };
    fetchExam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedParams.examId, isLoaded, user?.id]);

  // ── 이탈 경고 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ── AI 생성 완료 감지 ─────────────────────────────────────────────────────
  useEffect(() => {
    const results = Object.values(groupResults);
    if (results.length === 0) return;
    const allDone = results.every((r) => r.status !== "loading");
    if (!allDone) return;

    const successQuestions = results.flatMap((r) =>
      r.status === "success"
        ? r.questions.map((q) => ({
            id: q.id || `${Date.now()}-${Math.random()}`,
            text: q.text,
            type: q.type as Question["type"],
            options: q.options,
            correctOptionIndex: q.correctOptionIndex,
          }))
        : []
    );

    if (successQuestions.length > 0) {
      setQuestions((prev) => [...prev, ...successQuestions]);
      toast.success(`${successQuestions.length}개 문제가 추가되었습니다.`);
    }

    const errorResults = results.filter((r) => r.status === "error");
    errorResults.forEach((r) => toast.error(r.error || "문제 생성에 실패했습니다."));

    // 에러가 없을 때만 Dialog 닫기 (에러 시 프롬프트 유지로 재시도 가능)
    if (errorResults.length === 0) {
      setIsAddPickerOpen(false);
      setPickedPrompt("");
      setPickedCount(1);
    }
    resetBulk();
  }, [groupResults, resetBulk]);

  // ── 헬퍼 ──────────────────────────────────────────────────────────────────

  const generateExamCode = () => {
    if (
      examData.code &&
      !window.confirm(
        "코드를 재생성하면 기존에 코드를 받은 학생들은 새 코드로 입장해야 합니다.\n계속하시겠습니까?"
      )
    )
      return;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++)
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    setExamData((prev) => ({ ...prev, code: result }));
  };

  const calculateTotalSize = (files: File[]) =>
    files.reduce((total, file) => total + file.size, 0);

  const validateAndManageFileSize = (files: File[]) => {
    const MAX = 50 * 1024 * 1024;
    const total = calculateTotalSize(files);
    if (total <= MAX) {
      setDisabledFiles(new Set());
      setCanAddMoreFiles(true);
      return true;
    }
    setCanAddMoreFiles(false);
    toast.error("파일 용량이 50MB를 초과했습니다. 일부 파일이 비활성화됩니다.");
    const disabled = new Set<number>();
    let cur = 0;
    for (let i = files.length - 1; i >= 0; i--) {
      cur += files[i].size;
      if (cur > MAX) {
        disabled.add(i);
        cur -= files[i].size;
      }
    }
    setDisabledFiles(disabled);
    return false;
  };

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
      "application/csv",
      "application/x-hwp",
      "application/haansofthwp",
      "application/vnd.hancom.hwp",
      "application/vnd.hancom.hwpx",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowedExt = [
      "pdf", "ppt", "pptx", "doc", "docx", "xls", "xlsx", "csv",
      "hwp", "hwpx", "jpg", "jpeg", "png", "gif", "webp",
    ];
    if (!allowedTypes.includes(file.type) && !allowedExt.includes(ext || "")) {
      toast.error("지원되지 않는 파일 형식입니다.");
      return false;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("파일 크기가 50MB를 초과합니다.");
      return false;
    }
    return true;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canAddMoreFiles) {
      toast.error("파일 용량이 초과되어 더 이상 파일을 추가할 수 없습니다.");
      e.target.value = "";
      return;
    }
    const files = Array.from(e.target.files || []).filter(validateFile);
    if (files.length === 0) {
      e.target.value = "";
      return;
    }
    const newMaterials = [...examData.materials, ...files];
    validateAndManageFileSize(newMaterials);
    setExamData((prev) => ({ ...prev, materials: newMaterials }));
    files.forEach((f) => fileUpload.upload(f));
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canAddMoreFiles) setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!canAddMoreFiles) {
      toast.error("파일 용량이 초과되어 더 이상 파일을 추가할 수 없습니다.");
      return;
    }
    const files = Array.from(e.dataTransfer.files).filter(validateFile);
    if (files.length === 0) return;
    const newMaterials = [...examData.materials, ...files];
    validateAndManageFileSize(newMaterials);
    setExamData((prev) => ({ ...prev, materials: newMaterials }));
    files.forEach((f) => fileUpload.upload(f));
  };
  const handleDragAreaClick = () => {
    if (canAddMoreFiles) document.getElementById("materials")?.click();
  };

  const removeFile = (index: number) => {
    const removed = examData.materials[index];
    const newMaterials = examData.materials.filter((_, i) => i !== index);
    validateAndManageFileSize(newMaterials);
    setExamData((prev) => ({ ...prev, materials: newMaterials }));
    if (removed) fileUpload.removeFile(removed.name);
  };
  const removeExistingFile = (index: number) =>
    fileUpload.removeExistingUrl(index);

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const cls = "w-4 h-4 shrink-0";
    switch (ext) {
      case "pdf":
        return <FileText className={`${cls} text-red-500`} />;
      case "ppt":
      case "pptx":
        return <Presentation className={`${cls} text-orange-500`} />;
      case "doc":
      case "docx":
        return <FileText className={`${cls} text-blue-500`} />;
      case "xls":
      case "xlsx":
      case "csv":
        return <FileSpreadsheet className={`${cls} text-green-500`} />;
      case "hwp":
      case "hwpx":
        return <ClipboardList className={`${cls} text-sky-500`} />;
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
      case "webp":
        return <FileImage className={`${cls} text-purple-500`} />;
      default:
        return <File className={`${cls} text-muted-foreground`} />;
    }
  };

  const getFileNameFromUrl = (url: string) => {
    try {
      return decodeURIComponent(
        new URL(url).pathname.split("/").pop() || "파일"
      );
    } catch {
      return "파일";
    }
  };

  // ── 문제 추가 Dialog 핸들러 ────────────────────────────────────────────────

  const handleAdd = useCallback(() => {
    if (!pickedPrompt.trim()) {
      const newQs: Question[] = Array.from({ length: pickedCount }, (_, i) => ({
        id: `${Date.now()}-${i}`,
        text: "",
        type: pickedType,
        ...(pickedType === "multiple-choice"
          ? { options: ["", "", "", ""], correctOptionIndex: 0 }
          : pickedType === "true-false"
          ? { options: ["O", "X"] }
          : {}),
      }));
      setQuestions((prev) => [...prev, ...newQs]);
      setIsAddPickerOpen(false);
      setPickedPrompt("");
      setPickedCount(1);
    } else {
      if (!examData.title.trim()) {
        toast.error("AI 문제 생성 전에 시험 제목을 입력해주세요.");
        return;
      }
      generateAll(
        [
          {
            tempId: Date.now().toString(),
            type: toApiType(pickedType),
            prompt: pickedPrompt,
            count: pickedCount,
          },
        ],
        {
          examTitle: examData.title,
          language: examData.language,
          materialsText: fileUpload.getMaterialsText(),
        }
      );
    }
  }, [
    pickedPrompt,
    pickedType,
    pickedCount,
    examData.title,
    examData.language,
    fileUpload,
    generateAll,
  ]);

  // ── 저장 ──────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsLoading(true);
    try {
      const updateData = {
        title: examData.title,
        code: examData.code,
        duration: examData.duration,
        questions,
        chat_weight: chatWeight,
        materials: fileUpload.getUploadedUrls(),
        materials_text: fileUpload.getMaterialsText(),
        language: examData.language,
        updated_at: new Date().toISOString(),
      };
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_exam",
          data: { id: resolvedParams.examId, update: updateData },
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          extractErrorMessage(err, "시험 수정에 실패했습니다", response.status)
        );
      }
      toast.success("변경사항이 저장되었습니다.");
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "시험 수정 중 오류가 발생했습니다. 다시 시도해주세요"
        ),
        { duration: 5000 }
      );
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  }, [examData, questions, chatWeight, fileUpload, resolvedParams.examId]);

  // ── 제출 사유 + 준비 상태 ─────────────────────────────────────────────────

  const submitReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!examData.title) reasons.push("시험 제목을 입력해주세요");
    if (!examData.code) reasons.push("시험 코드를 생성해주세요");
    if (questions.length === 0) reasons.push("문제를 1개 이상 추가해주세요");
    if (
      questions.length > 0 &&
      questions.some((q) => isQuestionContentEmpty(q.text))
    )
      reasons.push("빈 문제 내용을 입력해주세요");
    if (!canAddMoreFiles) reasons.push("파일 용량이 50MB를 초과했습니다");
    if (examData.duration !== 0 && examData.duration < 15)
      reasons.push("시험 시간은 최소 15분 이상이어야 합니다");
    return reasons;
  }, [
    examData.title,
    examData.code,
    examData.duration,
    questions,
    canAddMoreFiles,
  ]);

  const ready = submitReasons.length === 0;

  const totalFileCount =
    examData.materials.length + fileUpload.existingUrls.length;
  const materialSummary = useMemo(() => {
    if (totalFileCount === 0) return "자료 없음";
    const statuses = Array.from(fileUpload.fileStatus?.values() ?? []);
    const failed = statuses.filter((s) => s === "failed").length;
    const inProgress = statuses.filter(
      (s) => s === "uploading" || s === "extracting"
    ).length;
    if (failed > 0) return `${totalFileCount}개 중 ${failed}개 실패`;
    if (inProgress > 0) return `${totalFileCount}개 분석 중`;
    return `${totalFileCount}개 준비됨`;
  }, [totalFileCount, fileUpload.fileStatus]);

  const effectiveWeight = chatWeight ?? 50;

  // ── 로딩 스피너 ───────────────────────────────────────────────────────────

  if (isLoadingExam) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        <span className="ml-2 text-muted-foreground">
          시험 데이터를 불러오는 중...
        </span>
      </div>
    );
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted/40">
      {/* ── Sticky 헤더 ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => router.push(`/instructor/${resolvedParams.examId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
            대시보드
          </Button>
          <div className="h-4 w-px bg-border" />
          <h1 className="font-semibold text-sm sm:text-base truncate">
            {examData.title ? `${examData.title} 편집` : "시험 편집"}
          </h1>
        </div>
      </header>

      {/* ── 콘텐츠 ─────────────────────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-4 py-8 pb-36">
        <div className="space-y-10">
          {/* 1. 시험 제목 */}
          <Field
            label="시험 제목"
            htmlFor="edit-title"
            required
            helper="학생이 입장 화면과 결과지에서 보게 될 이름입니다."
          >
            <Input
              id="edit-title"
              value={examData.title}
              onChange={(e) =>
                setExamData((p) => ({ ...p, title: e.target.value }))
              }
              className="h-12 text-base bg-white"
              placeholder="시험 제목을 입력하세요"
            />
          </Field>

          {/* 2. 시험 코드 */}
          <Field
            label="시험 코드"
            htmlFor="edit-code"
            required
            helper="학생이 시험에 입장할 때 사용하는 코드입니다. 변경 시 학생들에게 새 코드를 알려주세요."
          >
            <div className="flex items-center gap-2">
              <Input
                id="edit-code"
                value={examData.code}
                readOnly
                className="h-11 w-40 font-mono text-base tracking-widest bg-white"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={generateExamCode}
              >
                재생성
              </Button>
            </div>
          </Field>

          {/* 3. 시험 시간 */}
          <Field
            label="시험 시간"
            htmlFor="edit-duration"
            helper="응시 제한 시간입니다. 무제한으로 두면 시간 제약 없이 응시합니다."
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="edit-duration"
                type="number"
                value={examData.duration === 0 ? "" : examData.duration}
                onChange={(e) => {
                  const next = parseInt(
                    e.target.value.replace(/[^0-9]/g, ""),
                    10
                  );
                  if (!isNaN(next))
                    setExamData((p) => ({
                      ...p,
                      duration: Math.min(1440, Math.max(1, next)),
                    }));
                }}
                disabled={examData.duration === 0}
                className="h-11 w-28 text-center bg-white"
                min={1}
                max={1440}
                placeholder={examData.duration === 0 ? "무제한" : "60"}
              />
              <span className="text-sm text-muted-foreground">분</span>
              {[30, 60, 90, 120].map((v) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant={
                    examData.duration === v && examData.duration !== 0
                      ? "default"
                      : "outline"
                  }
                  disabled={examData.duration === 0}
                  onClick={() => setExamData((p) => ({ ...p, duration: v }))}
                >
                  {v}
                </Button>
              ))}
              <div className="ml-auto flex items-center gap-2">
                <Switch
                  id="edit-unlimited"
                  checked={examData.duration === 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      prevDurationRef.current = examData.duration || 60;
                      setExamData((p) => ({ ...p, duration: 0 }));
                    } else {
                      setExamData((p) => ({ ...p, duration: prevDurationRef.current }));
                    }
                  }}
                />
                <Label htmlFor="edit-unlimited" className="cursor-pointer text-sm">
                  무제한
                </Label>
              </div>
            </div>
            {examData.duration !== 0 && examData.duration < 15 && (
              <p className="flex items-center gap-1.5 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                출제하려면 15분 이상으로 설정하세요.
              </p>
            )}
          </Field>

          {/* 4. 수업 자료 */}
          <Field
            label="수업 자료"
            optional
            helper="업로드하면 AI가 자료를 근거로 문제를 만듭니다."
          >
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
              existingFiles={fileUpload.existingUrls.map((url, index) => ({
                url,
                name: getFileNameFromUrl(url),
                index,
              }))}
              onRemoveExistingFile={removeExistingFile}
              extractionStatus={fileUpload.fileStatus}
            />
          </Field>

          {/* 5. AI 응답 언어 */}
          <Field
            label="AI 응답 언어"
            helper="학생이 시험 중 AI 튜터와 대화할 때 사용할 언어입니다."
          >
            <Select
              value={examData.language}
              onValueChange={(v) =>
                setExamData((p) => ({ ...p, language: v as "ko" | "en" }))
              }
            >
              <SelectTrigger className="h-11 w-44 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ko">한국어 AI</SelectItem>
                <SelectItem value="en">English AI</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {/* 6. 문제 */}
          <Field
            label="문제"
            required
            helper={
              questions.length > 0
                ? `${questions.length}개 작성됨`
                : "최소 1개 이상 필요합니다."
            }
          >
            <div className="space-y-4">
              {/* 문제가 있을 때만 QuestionsList 표시 */}
              {questions.length > 0 && (
                <QuestionsList
                  questions={questions}
                  defaultOpen={true}
                  language={examData.language}
                  variant="line"
                  onUpdate={(id, field, value) =>
                    setQuestions((prev) =>
                      prev.map((q) => (q.id === id ? { ...q, [field]: value } : q))
                    )
                  }
                  onRemove={(id) =>
                    setQuestions((prev) => prev.filter((q) => q.id !== id))
                  }
                  onMove={(index, direction) =>
                    setQuestions((prev) => {
                      const next = [...prev];
                      const target = direction === "up" ? index - 1 : index + 1;
                      if (target < 0 || target >= next.length) return prev;
                      [next[index], next[target]] = [next[target], next[index]];
                      return next;
                    })
                  }
                />
              )}
              {/* 점선 박스 추가 버튼 — 시험 만들기와 동일한 스타일 */}
              <button
                type="button"
                onClick={() => setIsAddPickerOpen(true)}
                aria-label="문제 추가"
                data-testid={
                  questions.length === 0 ? "empty-add-question-btn" : "add-question-btn"
                }
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-10 text-center transition-colors hover:border-muted-foreground hover:bg-muted/50"
              >
                <Plus className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  {questions.length === 0 ? "첫 문제 추가" : "문제 추가"}
                </span>
                <span className="text-xs text-muted-foreground">
                  직접 작성하거나 AI로 생성하세요
                </span>
              </button>
            </div>
          </Field>

          {/* 7. 채점 비중 */}
          <Field
            label="채점 비중"
            optional
            helper="AI 대화 과정과 최종 답안을 채점에 반영하는 비율입니다. 비워두면 기본값 50:50으로 채점됩니다."
          >
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  대화 {effectiveWeight}% / 최종 답안{" "}
                  {100 - effectiveWeight}%
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvancedGrading((p) => !p)}
                  className="ml-auto"
                >
                  조정
                </Button>
              </div>
              {showAdvancedGrading && (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="edit-custom-weight"
                      checked={chatWeight !== null}
                      onCheckedChange={(checked) =>
                        setChatWeight(checked ? 50 : null)
                      }
                    />
                    <Label
                      htmlFor="edit-custom-weight"
                      className="text-sm"
                    >
                      직접 설정
                    </Label>
                  </div>
                  {chatWeight !== null && (
                    <Slider
                      value={[effectiveWeight]}
                      min={0}
                      max={100}
                      step={10}
                      onValueChange={([v]) => setChatWeight(v)}
                    />
                  )}
                </div>
              )}
            </div>
          </Field>
        </div>
      </main>

      {/* ── 하단 Sticky 상태바 ────────────────────────────────────────────── */}
      <div className="sticky bottom-4 z-20 mx-4" data-testid="edit-exam-statusbar">
        <div className="max-w-4xl mx-auto rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <Badge variant={ready ? "default" : "outline"}>
                  {ready ? "저장 가능" : "확인 필요"}
                </Badge>
                <Badge variant="outline">
                  {examData.duration === 0 ? "무제한" : `${examData.duration}분`}
                </Badge>
                <Badge variant="outline">문제 {questions.length}개</Badge>
                <Badge variant="outline">{materialSummary}</Badge>
              </div>
              {submitReasons.length > 0 && (
                <div
                  className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
                  data-testid="edit-exam-submit-reasons"
                >
                  {submitReasons.map((r) => (
                    <span key={r}>• {r}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  router.push(`/instructor/${resolvedParams.examId}`)
                }
              >
                취소
              </Button>
              <Button
                type="button"
                disabled={isLoading || !ready}
                onClick={handleSubmit}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  "변경사항 저장"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 문제 추가 Dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={isAddPickerOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (isBulkGenerating) return;
            setPickedPrompt("");
            setPickedCount(1);
            resetBulk();
          }
          setIsAddPickerOpen(open);
        }}
      >
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
          data-testid="add-question-picker"
        >
          <DialogHeader>
            <DialogTitle>문제 추가</DialogTitle>
            <DialogDescription>
              추가할 문제 유형을 선택하세요.
            </DialogDescription>
          </DialogHeader>

          <QuestionTypePicker value={pickedType} onChange={setPickedType} />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="edit-add-count" className="text-sm">
                개수
              </Label>
              <Select
                value={pickedCount.toString()}
                onValueChange={(v) => setPickedCount(parseInt(v, 10))}
              >
                <SelectTrigger
                  id="edit-add-count"
                  className="h-9 w-20"
                  data-testid="add-question-count"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n}개
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-1">
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
              어떤 문제를 만들고 싶은지 입력하세요{" "}
              <span className="text-xs">(비워두면 빈 문제 추가)</span>
            </label>
            <Textarea
              value={pickedPrompt}
              onChange={(e) => setPickedPrompt(e.target.value)}
              placeholder="예: AI 기술이 의료 산업에 미치는 영향을 분석하는 문제"
              rows={3}
              className="resize-none"
              disabled={isBulkGenerating}
            />
          </div>

          <div className="flex justify-end border-t pt-4">
            <Button
              type="button"
              onClick={handleAdd}
              disabled={isBulkGenerating}
              data-testid="manual-add-question-btn"
            >
              {isBulkGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  생성 중...
                </>
              ) : pickedPrompt.trim() ? (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI로 {pickedCount}개 생성
                </>
              ) : (
                "추가"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
