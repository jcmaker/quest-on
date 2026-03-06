"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Info,
  FileText,
  Presentation,
  FileSpreadsheet,
  FileImage,
  File,
  ClipboardList,
} from "lucide-react";
import toast from "react-hot-toast";
import { extractErrorMessage, getErrorMessage } from "@/lib/error-messages";
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
import { useExamDraftAutoSave } from "@/hooks/useExamDraftAutoSave";
import type { ChatMessage } from "@/hooks/useQuestionGeneration";

function isQuestionContentEmpty(text: string): boolean {
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}

export default function CreateExam() {
  const router = useRouter();
  const { user, isLoaded, isSignedIn } = useUser();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSignUpDialogOpen, setIsSignUpDialogOpen] = useState(false);
  const [createdExamCode, setCreatedExamCode] = useState("");

  // 데모 모드 체크: 로그인하지 않았거나 데모 페이지에서 온 경우
  const isDemoMode = !isLoaded || !isSignedIn || !user;
  const [examData, setExamData] = useState({
    title: "",
    duration: 60,
    code: "",
    materials: [] as File[],
  });
  const [disabledFiles, setDisabledFiles] = useState<Set<number>>(new Set());
  const [canAddMoreFiles, setCanAddMoreFiles] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [rubric, setRubric] = useState<RubricItem[]>([]);
  const [isRubricPublic, setIsRubricPublic] = useState(false);
  const [chatWeight, setChatWeight] = useState<number | null>(null);
  // 추출된 텍스트 저장: Map<fileUrl, {text: string, fileName: string}>
  const [extractedTexts, setExtractedTexts] = useState<
    Map<string, { text: string; fileName: string }>
  >(new Map());
  // 파일별 텍스트 추출 상태: Map<fileName, "extracting" | "done" | "failed">
  const [extractionStatus, setExtractionStatus] = useState<
    Map<string, "extracting" | "done" | "failed">
  >(new Map());

  // 문제 목록 참조 (스크롤용)
  const questionsListRef = useRef<HTMLDivElement>(null);

  // P1-2: 새로 수락된 문제 하이라이트
  const [highlightedQuestionIds, setHighlightedQuestionIds] = useState<Set<string>>(new Set());

  // AI 루브릭 생성 상태
  const [isAIGeneratingRubric, setIsAIGeneratingRubric] = useState(false);

  // P0-2: adjustHistory ref for localStorage persistence
  const adjustHistoryRef = useRef<Map<string, ChatMessage[]>>(new Map());

  // P0-1: localStorage 자동 저장
  const {
    showRestoreModal,
    savedDraft,
    restoreDraft,
    discardDraft,
    clearDraft,
  } = useExamDraftAutoSave({
    title: examData.title,
    duration: examData.duration,
    code: examData.code,
    questions,
    rubric,
    isRubricPublic,
    chatWeight,
    adjustHistoryRef,
  });

  const handleRestoreDraft = useCallback(() => {
    const draft = restoreDraft();
    if (draft) {
      setExamData((prev) => ({
        ...prev,
        title: draft.title || prev.title,
        duration: draft.duration ?? prev.duration,
        code: draft.code || prev.code,
      }));
      if (draft.questions?.length > 0) {
        setQuestions(draft.questions);
      }
      if (draft.rubric?.length > 0) {
        setRubric(draft.rubric);
      }
      setIsRubricPublic(draft.isRubricPublic ?? false);
      setChatWeight(draft.chatWeight ?? null);
      // P0-2: Restore adjust history
      if (draft.adjustHistory) {
        adjustHistoryRef.current = new Map(Object.entries(draft.adjustHistory));
      }
    }
  }, [restoreDraft]);

  // 폼 변경 감지 (이탈 경고용)
  const hasFormData = useCallback(() => {
    return (
      examData.title.trim() !== "" ||
      examData.materials.length > 0 ||
      questions.some((q) => !isQuestionContentEmpty(q.text)) ||
      rubric.some(
        (r) => r.evaluationArea.trim() !== "" || r.detailedCriteria.trim() !== ""
      )
    );
  }, [examData.title, examData.materials.length, questions, rubric]);

  // 이탈 경고
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasFormData()) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasFormData]);

  const generateExamCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setExamData((prev) => ({ ...prev, code: result }));
  };

  // 파일 용량 계산 함수
  const calculateTotalSize = (files: File[]) => {
    return files.reduce((total, file) => total + file.size, 0);
  };

  // 파일 용량 검증 및 비활성화 처리
  const validateAndManageFileSize = (files: File[]) => {
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    const totalSize = calculateTotalSize(files);

    if (totalSize <= MAX_SIZE) {
      // 용량이 정상인 경우
      setDisabledFiles(new Set());
      setCanAddMoreFiles(true);
      return true;
    }

    // 용량 초과 시 처리
    setCanAddMoreFiles(false);
    toast.error("파일 용량이 50MB를 초과했습니다. 일부 파일이 비활성화됩니다.");

    // 뒤에서부터 파일을 하나씩 비활성화하여 50MB 이하로 만들기
    const newDisabledFiles = new Set<number>();
    let currentSize = 0;

    for (let i = files.length - 1; i >= 0; i--) {
      currentSize += files[i].size;
      if (currentSize > MAX_SIZE) {
        newDisabledFiles.add(i);
        currentSize -= files[i].size; // 이 파일은 제외
      }
    }

    setDisabledFiles(newDisabledFiles);
    return false;
  };

  // 페이지 진입 시 자동으로 시험 코드 생성
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

    const maxSize = 50 * 1024 * 1024; // 50MB (will be compressed)

    // 파일 확장자로도 체크 (MIME 타입이 없는 경우 대비)
    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = [
      "pdf",
      "ppt",
      "pptx",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "csv",
      "hwp",
      "hwpx",
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
    ];

    if (
      !allowedTypes.includes(file.type) &&
      !allowedExtensions.includes(extension || "")
    ) {
      toast.error(
        "지원되지 않는 파일 형식입니다. PPT, PDF, 워드, 엑셀, 한글, 이미지 파일만 업로드 가능합니다."
      );
      return false;
    }

    if (file.size > maxSize) {
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

    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(validateFile);

    if (validFiles.length === 0) {
      e.target.value = "";
      return;
    }

    const newMaterials = [...examData.materials, ...validFiles];

    // 용량 검증 및 관리
    validateAndManageFileSize(newMaterials);

    setExamData((prev) => ({
      ...prev,
      materials: newMaterials,
    }));

    // 새로 추가된 파일들에 대해 텍스트 추출
    validFiles.forEach((file) => {
      extractTextFromFile(file);
    });

    // Reset input
    e.target.value = "";
  };

  // 드래그 앤 드롭 핸들러들
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canAddMoreFiles) {
      setIsDragOver(true);
    }
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

    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(validateFile);

    if (validFiles.length === 0) {
      return;
    }

    const newMaterials = [...examData.materials, ...validFiles];

    // 용량 검증 및 관리
    validateAndManageFileSize(newMaterials);

    setExamData((prev) => ({
      ...prev,
      materials: newMaterials,
    }));

    // 새로 추가된 파일들에 대해 텍스트 추출
    validFiles.forEach((file) => {
      extractTextFromFile(file);
    });
  };

  const handleDragAreaClick = () => {
    if (canAddMoreFiles) {
      document.getElementById("materials")?.click();
    }
  };

  const removeFile = (index: number) => {
    const newMaterials = examData.materials.filter((_, i) => i !== index);

    // 파일 삭제 후 용량 재검증
    validateAndManageFileSize(newMaterials);

    setExamData((prev) => ({
      ...prev,
      materials: newMaterials,
    }));
  };

  // 파일에서 텍스트 추출
  const extractTextFromFile = async (file: File) => {
    // 텍스트 추출 가능한 파일 형식인지 확인
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const textExtractableExtensions = ["pdf", "docx", "pptx", "csv"];

    if (!textExtractableExtensions.includes(extension)) {
      return; // 텍스트 추출 불가능한 파일은 건너뛰기
    }

    // 추출 상태 업데이트: 진행 중
    setExtractionStatus((prev) => {
      const newMap = new Map(prev);
      newMap.set(file.name, "extracting");
      return newMap;
    });

    try {
      // 파일을 FormData로 업로드
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("파일 업로드 실패");
      }

      const uploadResult = await uploadResponse.json();
      if (!uploadResult.ok || !uploadResult.url) {
        throw new Error("파일 업로드 실패");
      }

      // 텍스트 추출 API 호출
      const extractResponse = await fetch("/api/extract-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUrl: uploadResult.url,
          fileName: file.name,
          mimeType: file.type,
        }),
      });

      if (!extractResponse.ok) {
        let text = "";
        try {
          text = await extractResponse.text();
        } catch {
          throw new Error(
            `텍스트 추출 실패 (${extractResponse.status}): 응답을 읽을 수 없습니다.`
          );
        }

        let errorData: { error?: string; message?: string } = {};
        try {
          if (text) {
            errorData = JSON.parse(text);
          } else {
            errorData = { error: "서버에서 에러 응답을 반환하지 않았습니다." };
          }
        } catch {
          errorData = {
            error: `서버 오류 (${extractResponse.status}): ${
              text || "응답 본문이 비어있습니다"
            }`,
            message: text || "응답 본문이 비어있습니다",
          };
        }

        const errorMessage =
          errorData.error || errorData.message || "텍스트 추출 실패";
        throw new Error(errorMessage);
      }

      const extractResult = await extractResponse.json();

      // 추출된 텍스트를 상태에 저장
      if (extractResult.text && uploadResult.url) {
        setExtractedTexts((prev) => {
          const newMap = new Map(prev);
          newMap.set(uploadResult.url, {
            text: extractResult.text,
            fileName: file.name,
          });
          return newMap;
        });
        // 추출 상태: 완료
        setExtractionStatus((prev) => {
          const newMap = new Map(prev);
          newMap.set(file.name, "done");
          return newMap;
        });
      }
    } catch {
      // 추출 상태: 실패
      setExtractionStatus((prev) => {
        const newMap = new Map(prev);
        newMap.set(file.name, "failed");
        return newMap;
      });
      toast.error(`${file.name}: 텍스트 추출에 실패했습니다. AI 문제 생성 품질이 저하될 수 있습니다.`);
    }
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    const iconClass = "w-4 h-4 shrink-0";
    switch (extension) {
      case "pdf":
        return <FileText className={`${iconClass} text-red-500`} />;
      case "ppt":
      case "pptx":
        return <Presentation className={`${iconClass} text-orange-500`} />;
      case "doc":
      case "docx":
        return <FileText className={`${iconClass} text-blue-500`} />;
      case "xls":
      case "xlsx":
      case "csv":
        return <FileSpreadsheet className={`${iconClass} text-green-500`} />;
      case "hwp":
      case "hwpx":
        return <ClipboardList className={`${iconClass} text-sky-500`} />;
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
      case "webp":
        return <FileImage className={`${iconClass} text-purple-500`} />;
      default:
        return <File className={`${iconClass} text-muted-foreground`} />;
    }
  };

  const updateQuestion = (
    id: string,
    field: keyof Question,
    value: string | boolean
  ) => {
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, [field]: value } : q))
    );
  };

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        text: "",
        type: "essay" as const,
      },
    ]);
  };

  const moveQuestion = (index: number, direction: "up" | "down") => {
    setQuestions((prev) => {
      const newQuestions = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newQuestions.length) return prev;
      [newQuestions[index], newQuestions[targetIndex]] = [newQuestions[targetIndex], newQuestions[index]];
      return newQuestions;
    });
  };

  const addRubricItem = () => {
    const newRubricItem: RubricItem = {
      id: Date.now().toString(),
      evaluationArea: "",
      detailedCriteria: "",
    };

    setRubric([...rubric, newRubricItem]);
  };

  const updateRubricItem = (
    id: string,
    field: keyof RubricItem,
    value: string
  ) => {
    const updatedRubric = rubric.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    );

    setRubric(updatedRubric);
  };

  const removeRubricItem = (id: string) => {
    const newRubric = rubric.filter((item) => item.id !== id);
    setRubric(newRubric);
  };

  const handleAIGenerateRubric = useCallback(async () => {
    if (questions.length === 0 || questions.every((q) => isQuestionContentEmpty(q.text))) {
      toast.error("AI 루브릭을 생성하려면 문제를 먼저 작성해주세요.");
      return;
    }
    if (!examData.title.trim()) {
      toast.error("AI 루브릭을 생성하려면 시험 제목을 먼저 입력해주세요.");
      return;
    }

    setIsAIGeneratingRubric(true);
    try {
      const response = await fetch("/api/ai/generate-rubric", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examTitle: examData.title,
          questions: questions
            .filter((q) => !isQuestionContentEmpty(q.text))
            .map((q) => ({ text: q.text, type: q.type })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "루브릭 생성에 실패했습니다.");
      }

      const result = await response.json();
      if (result.rubric && Array.isArray(result.rubric)) {
        setRubric((prev) => {
          const nonEmpty = prev.filter(
            (r) => r.evaluationArea.trim() !== "" || r.detailedCriteria.trim() !== ""
          );
          return [
            ...nonEmpty,
            ...result.rubric.map((r: { evaluationArea: string; detailedCriteria: string }) => ({
              id: Date.now().toString() + Math.random().toString(36).slice(2),
              evaluationArea: r.evaluationArea,
              detailedCriteria: r.detailedCriteria,
            })),
          ];
        });
        toast.success("AI 평가 기준이 생성되었습니다.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "루브릭 생성 중 오류가 발생했습니다.";
      toast.error(message);
    } finally {
      setIsAIGeneratingRubric(false);
    }
  }, [examData.title, questions]);

  const createExamMutation = useMutation({
    mutationFn: async (examDataForDB: {
      title: string;
      code: string;
      duration: number;
      questions: Question[];
      rubric: RubricItem[];
      rubric_public: boolean;
      chat_weight: number | null;
      materials: string[];
      status: string;
      created_at: string;
      updated_at: string;
    }) => {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create_exam",
          data: examDataForDB,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = extractErrorMessage(
          errorData,
          "시험 생성에 실패했습니다",
          response.status
        );
        throw new Error(errorMessage);
      }

      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.instructor.exams() });
    },
  });

  const isSubmittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    // 데모 모드에서는 실제 제출을 막고 회원가입 유도
    if (isDemoMode) {
      isSubmittingRef.current = false;
      setIsSignUpDialogOpen(true);
      return;
    }

    // 비활성화된 버튼 클릭 시 이유 안내
    if (!examData.title) {
      isSubmittingRef.current = false;
      toast.error("시험 제목을 입력해주세요.");
      return;
    }
    if (!examData.code) {
      isSubmittingRef.current = false;
      toast.error("시험 코드를 생성해주세요.");
      return;
    }
    // 모든 문제에 대해 빈 텍스트 검증
    const emptyQuestionIndices = questions
      .map((q, i) => (isQuestionContentEmpty(q.text) ? i + 1 : -1))
      .filter((i) => i !== -1);
    if (emptyQuestionIndices.length > 0) {
      isSubmittingRef.current = false;
      toast.error(
        emptyQuestionIndices.length === questions.length
          ? "문제를 입력해주세요."
          : `${emptyQuestionIndices.join(", ")}번 문제가 비어있습니다.`
      );
      return;
    }
    if (!canAddMoreFiles) {
      isSubmittingRef.current = false;
      toast.error("파일 용량이 50MB를 초과했습니다. 일부 파일을 삭제해주세요.");
      return;
    }
    // duration 검증: 0(무제한)이 아니고 15 미만이면 에러
    if (examData.duration !== 0 && examData.duration < 15) {
      isSubmittingRef.current = false;
      toast.error("시험 시간은 최소 15분 이상이거나 무제한이어야 합니다.");
      return;
    }

    if (!examData.title) {
      isSubmittingRef.current = false;
      toast.error("시험 제목을 입력해주세요.");
      return;
    }
    if (!examData.code) {
      isSubmittingRef.current = false;
      toast.error("시험 코드를 입력해주세요.");
      return;
    }
    if (questions.length === 0) {
      isSubmittingRef.current = false;
      toast.error("최소 1개 이상의 문제를 추가해주세요.");
      return;
    }

    setIsLoading(true);

    try {
      let materialUrls: string[] = [];
      let materialsText: Array<{
        url: string;
        text: string;
        fileName: string;
      }> = [];

      // Upload files to Supabase Storage if any materials exist
      // 비활성화된 파일들을 제외하고 업로드
      const activeMaterials = examData.materials.filter(
        (_, index) => !disabledFiles.has(index)
      );

      if (activeMaterials.length > 0) {
        const uploadToastId = toast.loading(
          `파일 업로드 중... (0/${activeMaterials.length})`
        );
        let uploadedCount = 0;

        const uploadPromises = activeMaterials.map(async (file) => {
          // 원본 파일명은 파일 자체의 name 속성으로 서버에 전달됨
          try {
            // RLS 정책 문제 해결을 위한 Signed URL 방식
            const { createClient } = await import("@supabase/supabase-js");

            const supabase = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );

            // 안전한 파일명 생성
            const timestamp = new Date().toISOString().slice(0, 10);
            // UUID 생성 (fallback 포함)
            let randomId: string;
            if (typeof crypto !== "undefined" && crypto.randomUUID) {
              randomId = crypto.randomUUID();
            } else if (
              typeof crypto !== "undefined" &&
              crypto.getRandomValues
            ) {
              // Fallback: crypto.getRandomValues를 사용한 UUID 생성
              const array = new Uint8Array(16);
              crypto.getRandomValues(array);
              randomId = Array.from(array)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
            } else {
              // 최종 fallback: timestamp + random number
              randomId = `${Date.now()}_${Math.random()
                .toString(36)
                .substring(2, 15)}`;
            }
            const fileExtension =
              file.name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase() ||
              "bin";
            const safeFileName = `${timestamp}_${randomId}.${fileExtension}`;

            // Storage 경로: instructor-{userId}/{safeFileName}
            const storagePath = `instructor-${user?.id}/${safeFileName}`;

            // 먼저 직접 업로드 시도
            const { data, error } = await supabase.storage
              .from("exam-materials")
              .upload(storagePath, file, {
                contentType: file.type,
                upsert: true,
              });

            if (error) {
              // RLS 정책 에러인 경우 서버 API로 폴백
              if (
                error.message.includes("row-level security") ||
                error.message.includes("policy")
              ) {
                // 서버 API로 폴백 (4MB 제한 있지만 작은 파일은 가능)
                const formData = new FormData();
                formData.append("file", file);

                const uploadResponse = await fetch("/api/upload", {
                  method: "POST",
                  body: formData,
                });

                if (!uploadResponse.ok) {
                  if (uploadResponse.status === 413) {
                    throw new Error(
                      `${file.name}: 파일이 너무 큽니다 (${(
                        file.size /
                        1024 /
                        1024
                      ).toFixed(1)}MB). RLS 정책 수정이 필요합니다.`
                    );
                  }
                  throw new Error(
                    `${file.name}: 서버 업로드 실패 (${uploadResponse.status})`
                  );
                }

                const result = await uploadResponse.json();
                if (!result.ok) {
                  throw new Error(`${file.name}: ${result.message}`);
                }

                return result.url;
              }

              throw new Error(`${file.name}: 업로드 실패 - ${error.message}`);
            }

            // 직접 업로드 성공
            const { data: urlData } = supabase.storage
              .from("exam-materials")
              .getPublicUrl(data.path);

            uploadedCount++;
            toast.loading(
              `파일 업로드 중... (${uploadedCount}/${activeMaterials.length})`,
              { id: uploadToastId }
            );

            return urlData.publicUrl;
          } catch (error) {
            throw error;
          }
        });

        try {
          materialUrls = await Promise.all(uploadPromises);
          toast.success("파일 업로드 완료", { id: uploadToastId });
        } catch (uploadError) {
          toast.dismiss(uploadToastId);
          const errorMessage = getErrorMessage(
            uploadError,
            "파일 업로드 중 오류가 발생했습니다"
          );

          toast.error(errorMessage, {
            duration: 5000,
          });
          throw uploadError;
        }

        // 이미 추출된 텍스트를 재활용 (파일 선택 시 추출 완료됨)
        // 업로드된 URL과 기존 추출 텍스트를 매핑
        for (const [, { text, fileName }] of extractedTexts) {
          const matchingIndex = activeMaterials.findIndex(
            (f) => f.name === fileName
          );
          if (matchingIndex !== -1 && materialUrls[matchingIndex]) {
            materialsText.push({
              url: materialUrls[matchingIndex],
              text,
              fileName,
            });
          }
        }
      }

      // Prepare exam data for database
      const examDataForDB = {
        title: examData.title,
        code: examData.code,
        // duration: 0은 무제한(과제형), > 0은 시험형 (분 단위)
        // 명시적으로 0을 전송하여 fallback 로직이 작동하지 않도록 함
        duration: examData.duration,
        questions: questions,
        rubric: rubric, // 루브릭 데이터 추가
        rubric_public: isRubricPublic, // 루브릭 공개 여부
        chat_weight: chatWeight, // 채점 가중치 (null = 기본값 50)
        materials: materialUrls, // Array of file URLs
        materials_text: materialsText, // 추출된 텍스트 배열
        status: "draft", // Start as draft
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Save to Supabase using useMutation
      await createExamMutation.mutateAsync(examDataForDB);

      // P0-1: Clear draft on successful submit
      clearDraft();
      // Show dialog with exam code instead of redirecting
      setCreatedExamCode(examData.code);
      setIsDialogOpen(true);
    } catch {
      toast.error("시험 생성 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <ScrollProgressProvider
      global
      transition={{ stiffness: 150, damping: 30, bounce: 0 }}
    >
      <div className="fixed top-4 left-0 right-0 z-50 px-4">
        <div className="max-w-4xl mx-auto">
          <ScrollProgress
            className="h-1.5 bg-primary rounded-full"
            mode="width"
          />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2 w-full justify-between">
              <h1 className="text-3xl font-bold">새로운 시험 만들기</h1>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  // 데모 모드에서는 랜딩 페이지로, 일반 모드에서는 인스터럭터 대시보드로
                  if (isDemoMode) {
                    router.push("/");
                  } else {
                    router.push("/instructor");
                  }
                }}
                className="min-h-[44px] gap-2 border-border hover:bg-muted hover:text-foreground"
                aria-label="대시보드로 돌아가기"
              >
                <ArrowLeft className="w-4 h-4" />
                {isDemoMode ? "데모로 돌아가기" : "대시보드"}
              </Button>
            </div>
            <p className="text-muted-foreground">
              문제와 설정으로 새로운 시험을 구성하세요
            </p>
          </div>

          {/* 데모 모드 배너 (P0-1) */}
          {isDemoMode && isLoaded && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3">
              <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  데모 모드로 체험 중입니다
                </p>
                <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                  AI 문제 생성을 자유롭게 체험할 수 있지만, 실제 시험 출제를 위해서는{" "}
                  <button
                    type="button"
                    onClick={() => router.push("/sign-up")}
                    className="underline font-medium hover:text-amber-900 dark:hover:text-amber-200"
                  >
                    회원가입
                  </button>
                  이 필요합니다.
                </p>
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              // textarea에서는 엔터 허용, 다른 입력 요소에서는 form submit 방지
              if (
                e.key === "Enter" &&
                (e.target as HTMLElement).tagName !== "TEXTAREA"
              ) {
                e.preventDefault();
              }
            }}
            className="space-y-6"
          >
            <ExamInfoForm
              title={examData.title}
              code={examData.code}
              duration={examData.duration}
              onTitleChange={(value) =>
                setExamData((prev) => ({ ...prev, title: value }))
              }
              onCodeChange={(value) =>
                setExamData((prev) => ({ ...prev, code: value }))
              }
              onDurationChange={(value) =>
                setExamData((prev) => ({ ...prev, duration: value }))
              }
              onGenerateCode={generateExamCode}
            />

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
              extractionStatus={extractionStatus}
            />

            <CaseQuestionGenerator
              examTitle={examData.title}
              extractedTexts={extractedTexts}
              extractionStatus={extractionStatus}
              onQuestionsAccepted={(newQuestions) => {
                const newIds = newQuestions.map((q) => q.id);
                setQuestions((prev) => {
                  // 빈 초기 문제 자동 제거 (HTML 태그 strip 후 체크)
                  const nonEmpty = prev.filter((q) => {
                    const stripped = q.text.replace(/<[^>]*>/g, "").trim();
                    return stripped !== "";
                  });
                  return [
                    ...nonEmpty,
                    ...newQuestions.map((q) => ({
                      id: q.id,
                      text: q.text,
                      type: q.type as "essay" | "short-answer" | "multiple-choice",
                      rubric: q.rubric,
                    })),
                  ];
                });
                // P1-2: 새로 수락된 문제 하이라이트
                setHighlightedQuestionIds(new Set(newIds));
                setTimeout(() => setHighlightedQuestionIds(new Set()), 3000);
                // 문제 목록으로 스크롤
                setTimeout(() => {
                  questionsListRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }, 100);
              }}
              onRubricSuggested={(newRubric) => {
                setRubric((prev) => {
                  // 빈 초기 루브릭 자동 제거
                  const nonEmpty = prev.filter(
                    (r) => r.evaluationArea.trim() !== "" || r.detailedCriteria.trim() !== ""
                  );
                  return [
                    ...nonEmpty,
                    ...newRubric.map((r) => ({
                      id: Date.now().toString() + Math.random().toString(36).slice(2),
                      evaluationArea: r.evaluationArea,
                      detailedCriteria: r.detailedCriteria,
                    })),
                  ];
                });
              }}
            />

            <div ref={questionsListRef}>
              <QuestionsList
                questions={questions}
                highlightedIds={highlightedQuestionIds}
                defaultOpen={false}
                onUpdate={updateQuestion}
                onRemove={(id) => {
                  setQuestions((prev) => prev.filter((q) => q.id !== id));
                }}
                onAdd={addQuestion}
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
            />

            {/* Submit */}
            <div className="space-y-2">
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (isDemoMode) {
                      router.push("/");
                    } else {
                      router.push("/instructor");
                    }
                  }}
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  disabled={
                    isLoading ||
                    !examData.title ||
                    !examData.code ||
                    questions.length === 0 ||
                    questions.every((q) => isQuestionContentEmpty(q.text)) ||
                    !canAddMoreFiles
                  }
                >
                  {isLoading ? "출제 중..." : "출제하기"}
                </Button>
              </div>
              {/* P1-6: 제출 불가 이유 표시 */}
              {!isLoading && (
                !examData.title ||
                !examData.code ||
                questions.length === 0 ||
                questions.every((q) => isQuestionContentEmpty(q.text)) ||
                !canAddMoreFiles
              ) && (
                <div
                  className="text-xs text-muted-foreground space-y-0.5"
                  data-testid="create-exam-submit-reasons"
                >
                  {!examData.title && <p>• 시험 제목을 입력해주세요</p>}
                  {!examData.code && <p>• 시험 코드를 생성해주세요</p>}
                  {questions.length === 0 && <p>• 문제를 1개 이상 추가해주세요</p>}
                  {questions.length > 0 && questions.every((q) => isQuestionContentEmpty(q.text)) && (
                    <p>• 문제 내용을 입력해주세요</p>
                  )}
                  {!canAddMoreFiles && <p>• 파일 용량이 50MB를 초과했습니다</p>}
                </div>
              )}
            </div>
          </form>

          {/* 출제 완료 Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>출제 완료</DialogTitle>
                <DialogDescription>
                  시험이 성공적으로 출제되었습니다.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">시험 코드</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="px-4 py-2 bg-muted rounded-md exam-code text-lg font-semibold">
                        {createdExamCode}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(createdExamCode);
                          toast.success("시험 코드가 복사되었습니다.", {
                            id: "copy-exam-code",
                          });
                        }}
                      >
                        복사
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      이 코드를 학생들에게 공유하세요.
                    </p>
                  </div>
                  {/* P2-5: Summary */}
                  <div className="text-sm text-muted-foreground space-y-1 border-t pt-3">
                    <p>문제 {questions.length}개{examData.materials.length > 0 && ` · 자료 ${examData.materials.length}개`}{rubric.some(r => r.evaluationArea.trim()) && " · 루브릭 포함"}</p>
                    <p>시험 시간: {examData.duration === 0 ? "무제한 (과제형)" : `${examData.duration}분`}</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setIsDialogOpen(false);
                    router.push("/instructor");
                  }}
                >
                  확인
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 회원가입 유도 Dialog (데모 모드) */}
          <Dialog
            open={isSignUpDialogOpen}
            onOpenChange={setIsSignUpDialogOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>회원가입이 필요합니다</DialogTitle>
                <DialogDescription>
                  시험을 출제하려면 회원가입이 필요합니다.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-sm text-muted-foreground">
                  데모 모드에서는 실제로 시험을 출제할 수 없습니다. 회원가입을
                  하시면 전체 기능을 이용하실 수 있습니다.
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsSignUpDialogOpen(false)}
                >
                  닫기
                </Button>
                <Button onClick={() => router.push("/sign-up")}>
                  회원가입하기
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {/* P0-1: 드래프트 복원 확인 Dialog */}
          <Dialog open={showRestoreModal} onOpenChange={(open) => { if (!open) discardDraft(); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>이전 작업 복원</DialogTitle>
                <DialogDescription>
                  저장되지 않은 이전 작업이 있습니다. 복원하시겠습니까?
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                {savedDraft && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    {savedDraft.title && <p>제목: {savedDraft.title}</p>}
                    {savedDraft.questions?.length > 0 && (
                      <p>문제 {savedDraft.questions.length}개</p>
                    )}
                    <p className="text-xs">
                      저장 시각: {new Date(savedDraft.savedAt).toLocaleString("ko-KR")}
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={discardDraft}>
                  새로 시작
                </Button>
                <Button onClick={handleRestoreDraft}>
                  복원하기
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </ScrollProgressProvider>
  );
}
