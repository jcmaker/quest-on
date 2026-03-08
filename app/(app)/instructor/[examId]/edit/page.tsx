"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { extractErrorMessage, getErrorMessage } from "@/lib/error-messages";
import { useUser } from "@clerk/nextjs";
import {
  FileText,
  Presentation,
  FileSpreadsheet,
  FileImage,
  File,
  ClipboardList,
} from "lucide-react";
import { ExamInfoForm } from "@/components/instructor/ExamInfoForm";
import { FileUpload } from "@/components/instructor/FileUpload";
import {
  RubricTable,
  type RubricItem,
} from "@/components/instructor/RubricTable";
import { QuestionsList } from "@/components/instructor/QuestionsList";
import type { Question } from "@/components/instructor/QuestionEditor";
import { CaseQuestionGenerator } from "@/components/instructor/CaseQuestionGenerator";
import { useFileUpload } from "@/hooks/useFileUpload";

function isQuestionContentEmpty(text: string): boolean {
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}

export default function EditExam({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingExam, setIsLoadingExam] = useState(true);
  const [examData, setExamData] = useState({
    title: "",
    duration: 60,
    code: "",
    materials: [] as File[],
    existingMaterials: [] as string[], // 기존에 업로드된 파일 URL들
  });
  const [disabledFiles, setDisabledFiles] = useState<Set<number>>(new Set());
  const [canAddMoreFiles, setCanAddMoreFiles] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [rubric, setRubric] = useState<RubricItem[]>([]);
  const [isRubricPublic, setIsRubricPublic] = useState(false);
  const [chatWeight, setChatWeight] = useState<number | null>(null);
  const fileUpload = useFileUpload();
  const isSubmittingRef = useRef(false);

  // 기존 시험 데이터 불러오기
  useEffect(() => {
    const fetchExam = async () => {
      if (!isLoaded || !user) return;

      try {
        setIsLoadingExam(true);
        const response = await fetch("/api/supa", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "get_exam_by_id",
            data: { id: resolvedParams.examId },
          }),
        });

        if (!response.ok) {
          throw new Error("시험 데이터를 불러올 수 없습니다.");
        }

        const result = await response.json();
        const exam = result.exam;

        setExamData({
          title: exam.title || "",
          duration: exam.duration || 60,
          code: exam.code || "",
          materials: [],
          existingMaterials: exam.materials || [],
        });
        setQuestions(exam.questions || []);
        setRubric(
          exam.rubric && exam.rubric.length > 0
            ? exam.rubric
            : [
                {
                  id: Date.now().toString(),
                  evaluationArea: "",
                  detailedCriteria: "",
                },
              ]
        );
        setIsRubricPublic(exam.rubric_public || false);
        setChatWeight(exam.chat_weight ?? null);

        // 기존 materials + materials_text를 fileUpload hook에 로드
        fileUpload.initExistingData(
          exam.materials || [],
          exam.materials_text
        );
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

  // 폼 변경 감지 (이탈 경고용)
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const hasFormChanges = useCallback(() => {
    if (!initialDataLoaded) return false;
    return true; // 편집 모드에서는 데이터 로드 후 항상 변경 가능성이 있으므로 경고
  }, [initialDataLoaded]);

  // 이탈 경고
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasFormChanges()) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasFormChanges]);

  // 초기 데이터 로드 완료 표시
  useEffect(() => {
    if (!isLoadingExam) {
      // 약간의 딜레이로 초기 렌더링 후 활성화
      const timer = setTimeout(() => setInitialDataLoaded(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isLoadingExam]);

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
      setDisabledFiles(new Set());
      setCanAddMoreFiles(true);
      return true;
    }

    setCanAddMoreFiles(false);
    toast.error("파일 용량이 50MB를 초과했습니다. 일부 파일이 비활성화됩니다.");

    const newDisabledFiles = new Set<number>();
    let currentSize = 0;

    for (let i = files.length - 1; i >= 0; i--) {
      currentSize += files[i].size;
      if (currentSize > MAX_SIZE) {
        newDisabledFiles.add(i);
        currentSize -= files[i].size;
      }
    }

    setDisabledFiles(newDisabledFiles);
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

    const maxSize = 50 * 1024 * 1024; // 50MB

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
        "지원되지 않는 파일 형식입니다. PPT, PDF, 워드, 엑셀, CSV, 한글, 이미지 파일만 업로드 가능합니다."
      );
      return false;
    }

    if (file.size > maxSize) {
      toast.error("파일 크기가 50MB를 초과합니다.");
      return false;
    }

    return true;
  };

  // 파일 업로드 + 텍스트 추출은 useFileUpload hook이 처리

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
    validateAndManageFileSize(newMaterials);

    setExamData((prev) => ({
      ...prev,
      materials: newMaterials,
    }));

    // 파일 업로드 + 텍스트 추출 (서버 경유, URL 재사용)
    validFiles.forEach((file) => {
      fileUpload.upload(file);
    });

    e.target.value = "";
  };

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
    validateAndManageFileSize(newMaterials);

    setExamData((prev) => ({
      ...prev,
      materials: newMaterials,
    }));

    // 파일 업로드 + 텍스트 추출 (서버 경유, URL 재사용)
    validFiles.forEach((file) => {
      fileUpload.upload(file);
    });
  };

  const handleDragAreaClick = () => {
    if (canAddMoreFiles) {
      document.getElementById("materials")?.click();
    }
  };

  const removeFile = (index: number) => {
    const removedFile = examData.materials[index];
    const newMaterials = examData.materials.filter((_, i) => i !== index);
    validateAndManageFileSize(newMaterials);

    setExamData((prev) => ({
      ...prev,
      materials: newMaterials,
    }));

    // hook에서도 업로드된 파일 정보 제거
    if (removedFile) {
      fileUpload.removeFile(removedFile.name);
    }
  };

  const removeExistingFile = (index: number) => {
    fileUpload.removeExistingUrl(index);
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

  const getFileNameFromUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const fileName = pathname.split("/").pop() || "파일";
      return decodeURIComponent(fileName);
    } catch {
      return "파일";
    }
  };

  const addQuestion = () => {
    const newQuestion: Question = {
      id: Date.now().toString(),
      text: "",
      type: "essay",
    };
    setQuestions([...questions, newQuestion]);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

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
    if (questions.length === 0) {
      isSubmittingRef.current = false;
      toast.error("최소 1개 이상의 문제를 추가해주세요.");
      return;
    }
    if (questions.some((q) => isQuestionContentEmpty(q.text))) {
      isSubmittingRef.current = false;
      toast.error("문제 내용을 입력해주세요.");
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

    setIsLoading(true);

    try {
      // 파일은 이미 선택 시점에 업로드 완료됨 → URL 재사용
      const materialUrls = fileUpload.getUploadedUrls();
      const materialsText = fileUpload.getMaterialsText();

      // 시험 데이터 업데이트
      const updateData = {
        title: examData.title,
        code: examData.code,
        duration: examData.duration,
        questions: questions,
        rubric: rubric,
        rubric_public: isRubricPublic,
        chat_weight: chatWeight,
        materials: materialUrls,
        materials_text: materialsText,
        updated_at: new Date().toISOString(),
      };

      // Update exam in Supabase
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_exam",
          data: {
            id: resolvedParams.examId,
            update: updateData,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = extractErrorMessage(
          errorData,
          "시험 수정에 실패했습니다",
          response.status
        );
        throw new Error(errorMessage);
      }

      await response.json();

      toast.success("시험이 성공적으로 수정되었습니다.");
      router.push(`/instructor/${resolvedParams.examId}`);
    } catch (error) {
      const errorMessage = getErrorMessage(
        error,
        "시험 수정 중 오류가 발생했습니다. 다시 시도해주세요"
      );
      toast.error(errorMessage, {
        duration: 5000, // 에러 메시지가 길 수 있으므로 더 길게 표시
      });
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  if (isLoadingExam) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
          <span className="ml-2 text-muted-foreground">
            시험 데이터를 불러오는 중...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">시험 편집</h1>
            <p className="text-muted-foreground">
              문제와 설정으로 시험을 수정하세요
            </p>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
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
          existingFiles={fileUpload.existingUrls.map((url, index) => ({
            url,
            name: getFileNameFromUrl(url),
            index,
          }))}
          onRemoveExistingFile={removeExistingFile}
          extractionStatus={fileUpload.fileStatus}
        />

        <CaseQuestionGenerator
          examTitle={examData.title}
          extractedTexts={fileUpload.extractedTexts}
          extractionStatus={fileUpload.fileStatus}
          onQuestionsAccepted={(newQuestions) => {
            setQuestions((prev) => [
              ...prev,
              ...newQuestions.map((q) => ({
                id: q.id,
                text: q.text,
                type: q.type as "essay" | "short-answer" | "multiple-choice",
              })),
            ]);
          }}
          onRubricSuggested={(newRubric) => {
            setRubric((prev) => [
              ...prev,
              ...newRubric.map((r) => ({
                id: Date.now().toString() + Math.random().toString(36).slice(2),
                evaluationArea: r.evaluationArea,
                detailedCriteria: r.detailedCriteria,
              })),
            ]);
          }}
        />

        <QuestionsList
          questions={questions}
          defaultOpen={true}
          onUpdate={updateQuestion}
          onRemove={(id) => {
            setQuestions((prev) => prev.filter((q) => q.id !== id));
          }}
          onAdd={addQuestion}
          onMove={moveQuestion}
        />

        <RubricTable
          rubric={rubric}
          onAdd={addRubricItem}
          onUpdate={updateRubricItem}
          onRemove={removeRubricItem}
          isPublic={isRubricPublic}
          onPublicChange={setIsRubricPublic}
          chatWeight={chatWeight}
          onChatWeightChange={setChatWeight}
        />

        {/* Submit */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/instructor/${resolvedParams.examId}`)}
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
              questions.some((q) => isQuestionContentEmpty(q.text)) ||
              !canAddMoreFiles
            }
          >
            {isLoading ? "수정 중..." : "시험 수정하기"}
          </Button>
        </div>
        {!isLoading && (
          !examData.title ||
          !examData.code ||
          questions.length === 0 ||
          questions.some((q) => isQuestionContentEmpty(q.text)) ||
          !canAddMoreFiles
        ) && (
          <div
            className="mt-2 text-xs text-muted-foreground space-y-0.5"
            data-testid="edit-exam-submit-reasons"
          >
            {!examData.title && <p>• 시험 제목을 입력해주세요</p>}
            {!examData.code && <p>• 시험 코드를 생성해주세요</p>}
            {questions.length === 0 && <p>• 문제를 1개 이상 추가해주세요</p>}
            {questions.length > 0 &&
              questions.some((q) => isQuestionContentEmpty(q.text)) && (
                <p>• 문제 내용을 입력해주세요</p>
              )}
            {!canAddMoreFiles && <p>• 파일 용량이 50MB를 초과했습니다</p>}
          </div>
        )}
      </form>
      </div>
    </div>
  );
}
