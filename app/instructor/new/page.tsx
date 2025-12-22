"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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

export default function CreateExam() {
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [createdExamCode, setCreatedExamCode] = useState("");
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
  const [rubric, setRubric] = useState<RubricItem[]>([
    {
      id: Date.now().toString(),
      evaluationArea: "",
      detailedCriteria: "",
    },
  ]);
  const [isRubricPublic, setIsRubricPublic] = useState(false);
  // 추출된 텍스트 저장: Map<fileUrl, {text: string, fileName: string}>
  const [extractedTexts, setExtractedTexts] = useState<
    Map<string, { text: string; fileName: string }>
  >(new Map());

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

    // 콘솔에 텍스트 추출 시작 로그
    console.log(`[extract-text] 텍스트 추출 시작: ${file.name}`);

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
        // 응답이 JSON이 아닐 수 있으므로 텍스트로 먼저 확인
        let text = "";
        try {
          text = await extractResponse.text();
        } catch (textError) {
          console.error(`[extract-text] 응답 텍스트 읽기 실패:`, textError);
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
        } catch (parseError) {
          // JSON 파싱 실패 시 원본 텍스트 사용
          console.error(`[extract-text] JSON 파싱 실패:`, {
            status: extractResponse.status,
            statusText: extractResponse.statusText,
            text: text.substring(0, 200),
            parseError,
          });
          errorData = {
            error: `서버 오류 (${extractResponse.status}): ${
              text || "응답 본문이 비어있습니다"
            }`,
            message: text || "응답 본문이 비어있습니다",
          };
        }

        const errorMessage =
          errorData.error || errorData.message || "텍스트 추출 실패";
        console.error(`[extract-text] API 에러:`, {
          errorData,
          status: extractResponse.status,
          statusText: extractResponse.statusText,
          hasError: !!errorData.error,
          hasMessage: !!errorData.message,
        });
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
        console.log(`[extract-text] 텍스트 저장 완료 (${file.name}):`, {
          fileName: file.name,
          textLength: extractResult.text?.length || 0,
        });
      }
    } catch (error) {
      console.error(`[extract-text] 텍스트 추출 실패 (${file.name}):`, error);
    }
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

  const createExamMutation = useMutation({
    mutationFn: async (examDataForDB: {
      title: string;
      code: string;
      duration: number;
      questions: Question[];
      rubric: RubricItem[];
      rubric_public: boolean;
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
        const errorData = await response.json();
        throw new Error(
          `Failed to create exam: ${errorData.error || "Unknown error"}`
        );
      }

      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.instructor.exams() });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 비활성화된 버튼 클릭 시 이유 안내
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

    if (!examData.title || !examData.code || questions.length === 0) return;

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
        const uploadPromises = activeMaterials.map(async (file) => {
          // 원본 파일명은 파일 자체의 name 속성으로 서버에 전달됨
          console.log(`[client] Processing file: ${file.name}`, {
            originalName: file.name,
            fileSize: file.size,
            fileType: file.type,
          });

          try {
            // RLS 정책 문제 해결을 위한 Signed URL 방식
            const { createClient } = await import("@supabase/supabase-js");

            const supabase = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );

            // 안전한 파일명 생성
            const timestamp = new Date().toISOString().slice(0, 10);
            const randomId = crypto.randomUUID();
            const fileExtension =
              file.name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase() ||
              "bin";
            const safeFileName = `${timestamp}_${randomId}.${fileExtension}`;

            // Storage 경로: instructor-{userId}/{safeFileName}
            const storagePath = `instructor-${user?.id}/${safeFileName}`;

            console.log(`[client] Attempting direct upload to Supabase:`, {
              originalName: file.name,
              storagePath: storagePath,
              fileSize: file.size,
              fileType: file.type,
            });

            // 먼저 직접 업로드 시도
            const { data, error } = await supabase.storage
              .from("exam-materials")
              .upload(storagePath, file, {
                contentType: file.type,
                upsert: true,
              });

            if (error) {
              console.error(
                `[client] Direct upload failed for ${file.name}:`,
                error
              );

              // RLS 정책 에러인 경우 서버 API로 폴백
              if (
                error.message.includes("row-level security") ||
                error.message.includes("policy")
              ) {
                console.log(
                  `[client] RLS policy error detected, falling back to server API for ${file.name}`
                );

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

                console.log(
                  `[client] Server upload successful for ${file.name}`
                );
                return result.url;
              }

              throw new Error(`${file.name}: 업로드 실패 - ${error.message}`);
            }

            // 직접 업로드 성공
            const { data: urlData } = supabase.storage
              .from("exam-materials")
              .getPublicUrl(data.path);

            console.log(`[client] Direct upload successful for ${file.name}:`, {
              originalName: file.name,
              storagePath: data.path,
              publicUrl: urlData.publicUrl,
              fileSize: file.size,
              fileType: file.type,
            });

            return urlData.publicUrl;
          } catch (error) {
            console.error(
              `[client] Direct upload error for ${file.name}:`,
              error
            );
            throw error;
          }
        });

        try {
          console.log(
            `[client] Starting upload of ${activeMaterials.length} files...`
          );
          materialUrls = await Promise.all(uploadPromises);
          console.log(
            `[client] Successfully uploaded ${materialUrls.length} files`
          );
        } catch (uploadError) {
          console.error("[client] File upload failed:", uploadError);

          // 에러 메시지 추출 및 표시
          const errorMessage =
            uploadError instanceof Error
              ? uploadError.message
              : "파일 업로드 중 오류가 발생했습니다.";

          toast.error(errorMessage);
          throw uploadError; // Re-throw to prevent exam creation
        }

        // 파일 업로드 후 텍스트 추출 (업로드된 실제 URL 사용)
        console.log(
          `[client] Starting text extraction for ${materialUrls.length} files...`
        );
        const textExtractionPromises = activeMaterials.map(
          async (file, index) => {
            const url = materialUrls[index];
            if (!url) return null;

            const extension = file.name.split(".").pop()?.toLowerCase() || "";
            const textExtractableExtensions = ["pdf", "docx", "pptx", "csv"];

            if (!textExtractableExtensions.includes(extension)) {
              return null; // 텍스트 추출 불가능한 파일은 건너뛰기
            }

            try {
              console.log(`[client] Extracting text from ${file.name}...`);
              const extractResponse = await fetch("/api/extract-text", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  fileUrl: url,
                  fileName: file.name,
                  mimeType: file.type,
                }),
              });

              if (!extractResponse.ok) {
                console.error(
                  `[client] Text extraction failed for ${file.name}`
                );
                return null;
              }

              const extractResult = await extractResponse.json();
              if (extractResult.text) {
                return {
                  url,
                  text: extractResult.text,
                  fileName: file.name,
                };
              }
              return null;
            } catch (error) {
              console.error(
                `[client] Text extraction error for ${file.name}:`,
                error
              );
              return null;
            }
          }
        );

        // 텍스트 추출 결과 수집
        const extractedTextsArray = await Promise.all(textExtractionPromises);
        materialsText = extractedTextsArray.filter(
          (item): item is { url: string; text: string; fileName: string } =>
            item !== null
        );

        console.log(
          `[client] Text extraction completed: ${materialsText.length} files extracted`
        );
      }

      // 기존 extractedTexts는 사용하지 않음 (URL 매칭 문제로 인해)

      // Prepare exam data for database
      console.log(`[client] Preparing exam data:`, {
        materialsCount: materialUrls.length,
        materialsTextCount: materialsText.length,
        materialsTextPreview: materialsText.map((m) => ({
          fileName: m.fileName,
          textLength: m.text.length,
        })),
      });

      const examDataForDB = {
        title: examData.title,
        code: examData.code,
        duration: examData.duration,
        questions: questions,
        rubric: rubric, // 루브릭 데이터 추가
        rubric_public: isRubricPublic, // 루브릭 공개 여부
        materials: materialUrls, // Array of file URLs
        materials_text: materialsText, // 추출된 텍스트 배열
        status: "draft", // Start as draft
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Save to Supabase using useMutation
      const result = await createExamMutation.mutateAsync(examDataForDB);
      console.log("Exam created successfully:", result);

      // Show dialog with exam code instead of redirecting
      setCreatedExamCode(examData.code);
      setIsDialogOpen(true);
    } catch (error) {
      console.error("Error creating exam:", error);
      alert("시험 생성 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">새로운 시험 만들기</h1>
            <p className="text-muted-foreground">
              문제와 설정으로 새로운 시험을 구성하세요
            </p>
          </div>
        </div>
      </div>

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
          onAdd={addQuestion}
          onUpdate={updateQuestion}
          onRemove={removeQuestion}
        />

        {/* Submit */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/instructor")}
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
            {isLoading ? "출제 중..." : "출제하기"}
          </Button>
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
            <div className="space-y-2">
              <Label className="text-sm font-medium">시험 코드</Label>
              <div className="flex items-center gap-2">
                <code className="px-4 py-2 bg-muted rounded-md exam-code text-lg font-semibold">
                  {createdExamCode}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(createdExamCode);
                    toast.success("시험 코드가 복사되었습니다.");
                  }}
                >
                  복사
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                이 코드를 학생들에게 공유하세요.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setIsDialogOpen(false);
                router.push("/instructor/drive");
              }}
            >
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
