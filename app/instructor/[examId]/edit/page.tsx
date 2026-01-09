"use client";

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { extractErrorMessage, getErrorMessage } from "@/lib/error-messages";
import { useUser } from "@clerk/nextjs";
import { ExamInfoForm } from "@/components/instructor/ExamInfoForm";
import { FileUpload } from "@/components/instructor/FileUpload";
import {
  RubricTable,
  type RubricItem,
} from "@/components/instructor/RubricTable";
import { QuestionsList } from "@/components/instructor/QuestionsList";
import type { Question } from "@/components/instructor/QuestionEditor";

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
      } catch (error) {
        console.error("Error fetching exam:", error);
        toast.error("시험 데이터를 불러오는 중 오류가 발생했습니다.");
        router.push(`/instructor/${resolvedParams.examId}`);
      } finally {
        setIsLoadingExam(false);
      }
    };

    fetchExam();
  }, [resolvedParams.examId, isLoaded, user, router]);

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
      alert(
        "지원되지 않는 파일 형식입니다. PPT, PDF, 워드, 엑셀, 한글, 이미지 파일만 업로드 가능합니다."
      );
      return false;
    }

    if (file.size > maxSize) {
      alert("파일 크기가 50MB를 초과합니다.");
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
    validateAndManageFileSize(newMaterials);

    setExamData((prev) => ({
      ...prev,
      materials: newMaterials,
    }));

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
  };

  const handleDragAreaClick = () => {
    if (canAddMoreFiles) {
      document.getElementById("materials")?.click();
    }
  };

  const removeFile = (index: number) => {
    const newMaterials = examData.materials.filter((_, i) => i !== index);
    validateAndManageFileSize(newMaterials);

    setExamData((prev) => ({
      ...prev,
      materials: newMaterials,
    }));
  };

  const removeExistingFile = (index: number) => {
    const newExistingMaterials = examData.existingMaterials.filter(
      (_, i) => i !== index
    );
    setExamData((prev) => ({
      ...prev,
      existingMaterials: newExistingMaterials,
    }));
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "pdf":
        return "📄";
      case "ppt":
      case "pptx":
        return "📊";
      case "doc":
      case "docx":
        return "📝";
      case "xls":
      case "xlsx":
        return "📈";
      case "hwp":
      case "hwpx":
        return "📋";
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
      case "webp":
        return "🖼️";
      default:
        return "📎";
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

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
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

    if (!examData.title) {
      toast.error("시험 제목을 입력해주세요.");
      return;
    }
    if (!examData.code) {
      toast.error("시험 코드를 생성해주세요.");
      return;
    }
    if (questions.length === 0) {
      toast.error("최소 1개 이상의 문제를 추가해주세요.");
      return;
    }
    if (!canAddMoreFiles) {
      toast.error("파일 용량이 50MB를 초과했습니다. 일부 파일을 삭제해주세요.");
      return;
    }
    // duration 검증: 0(무제한)이 아니고 15 미만이면 에러
    if (examData.duration !== 0 && examData.duration < 15) {
      toast.error("시험 시간은 최소 15분 이상이거나 무제한이어야 합니다.");
      return;
    }

    setIsLoading(true);

    try {
      let materialUrls: string[] = [...examData.existingMaterials];

      // 새로 추가된 파일 업로드
      const activeMaterials = examData.materials.filter(
        (_, index) => !disabledFiles.has(index)
      );

      if (activeMaterials.length > 0) {
        let uploadedCount = 0;
        const totalFiles = activeMaterials.length;
        const loadingToast = toast.loading(
          `파일 업로드 중... (0/${totalFiles})`
        );

        const uploadPromises = activeMaterials.map(async (file) => {
          try {
            const { createClient } = await import("@supabase/supabase-js");

            const supabase = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );

            const timestamp = new Date().toISOString().slice(0, 10);
            const randomId = crypto.randomUUID();
            const fileExtension =
              file.name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase() ||
              "bin";
            const safeFileName = `${timestamp}_${randomId}.${fileExtension}`;
            const storagePath = `instructor-${user?.id}/${safeFileName}`;

            const { data, error } = await supabase.storage
              .from("exam-materials")
              .upload(storagePath, file, {
                contentType: file.type,
                upsert: true,
              });

            if (error) {
              if (
                error.message.includes("row-level security") ||
                error.message.includes("policy")
              ) {
                const formData = new FormData();
                formData.append("file", file);

                const uploadResponse = await fetch("/api/upload", {
                  method: "POST",
                  body: formData,
                });

                if (!uploadResponse.ok) {
                  throw new Error(
                    `${file.name}: 서버 업로드 실패 (${uploadResponse.status})`
                  );
                }

                const result = await uploadResponse.json();
                if (!result.ok) {
                  throw new Error(`${file.name}: ${result.message}`);
                }

                uploadedCount++;
                toast.loading(
                  `파일 업로드 중... (${uploadedCount}/${totalFiles})`,
                  {
                    id: loadingToast,
                  }
                );

                return result.url;
              }

              throw new Error(`${file.name}: 업로드 실패 - ${error.message}`);
            }

            const { data: urlData } = supabase.storage
              .from("exam-materials")
              .getPublicUrl(data.path);

            uploadedCount++;
            toast.loading(
              `파일 업로드 중... (${uploadedCount}/${totalFiles})`,
              {
                id: loadingToast,
              }
            );

            return urlData.publicUrl;
          } catch (error) {
            console.error(`Error uploading ${file.name}:`, error);
            throw error;
          }
        });

        try {
          const newUrls = await Promise.all(uploadPromises);
          materialUrls = [...materialUrls, ...newUrls];
          toast.dismiss(loadingToast);
        } catch (uploadError) {
          toast.dismiss(loadingToast);
          const errorMessage = getErrorMessage(
            uploadError,
            "파일 업로드 중 오류가 발생했습니다"
          );

          toast.error(errorMessage, {
            duration: 5000, // 에러 메시지가 길 수 있으므로 더 길게 표시
          });
          throw uploadError;
        }
      }

      // 시험 데이터 업데이트
      const updateData = {
        title: examData.title,
        code: examData.code,
        // duration: 0은 무제한(과제형), > 0은 시험형 (분 단위)
        // 명시적으로 0을 전송하여 fallback 로직이 작동하지 않도록 함
        duration: examData.duration,
        questions: questions,
        rubric: rubric,
        rubric_public: isRubricPublic,
        materials: materialUrls,
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
        console.error("API Error:", errorData);
        const errorMessage = extractErrorMessage(
          errorData,
          "시험 수정에 실패했습니다",
          response.status
        );
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log("Exam updated successfully:", result);

      toast.success("시험이 성공적으로 수정되었습니다.");
      router.push(`/instructor/${resolvedParams.examId}`);
    } catch (error) {
      console.error("Error updating exam:", error);
      const errorMessage = getErrorMessage(
        error,
        "시험 수정 중 오류가 발생했습니다. 다시 시도해주세요"
      );
      toast.error(errorMessage, {
        duration: 5000, // 에러 메시지가 길 수 있으므로 더 길게 표시
      });
    } finally {
      setIsLoading(false);
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
    <div className="container mx-auto p-6 max-w-4xl">
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
          existingFiles={examData.existingMaterials.map((url, index) => ({
            url,
            name: getFileNameFromUrl(url),
            index,
          }))}
          onRemoveExistingFile={removeExistingFile}
        />

        <RubricTable
          rubric={rubric}
          onAdd={addRubricItem}
          onUpdate={updateRubricItem}
          onRemove={removeRubricItem}
          isPublic={isRubricPublic}
          onPublicChange={setIsRubricPublic}
        />

        <QuestionsList
          questions={questions}
          onUpdate={updateQuestion}
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
            disabled={isLoading}
            className={
              !examData.title ||
              !examData.code ||
              questions.length === 0 ||
              !canAddMoreFiles
                ? "opacity-50 cursor-not-allowed"
                : ""
            }
          >
            {isLoading ? "수정 중..." : "시험 수정하기"}
          </Button>
        </div>
      </form>
    </div>
  );
}
