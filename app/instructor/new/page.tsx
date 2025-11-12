"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";
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
  const [isLoading, setIsLoading] = useState(false);
  const [examData, setExamData] = useState({
    title: "",
    description: "",
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
      weight: 100,
    },
  ]);

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

  const generateQuestionWithAI = async (questionId: string) => {
    if (!examData.title) {
      alert("시험 제목을 먼저 입력해주세요.");
      return;
    }

    const currentQuestion = questions.find((q) => q.id === questionId);
    if (!currentQuestion) return;

    // 해당 문제의 로딩 상태 설정
    setQuestions(
      questions.map((q) =>
        q.id === questionId ? { ...q, isGenerating: true } : q
      )
    );

    try {
      let prompt;

      if (currentQuestion.aiCommand && currentQuestion.aiCommand.trim()) {
        // AI 명령어가 있는 경우 - 기존 문제를 수정
        prompt = `당신은 전문 시험 출제자입니다. 다음 정보를 바탕으로 기존 문제를 수정해주세요.

시험 정보:
- 제목: ${examData.title}
${examData.description ? `- 설명: ${examData.description}` : ""}
- 시간: ${examData.duration}분

기존 문제:
${currentQuestion.text}

수정 요청: ${currentQuestion.aiCommand}

${
  rubric.length > 0
    ? `\n평가 루브릭:
${rubric
  .map(
    (item) =>
      `- ${item.evaluationArea}: ${item.detailedCriteria} (비중: ${item.weight}%)`
  )
  .join("\n")}
\n위 루브릭의 평가 기준에 맞는 문제를 만들어야 합니다.`
    : ""
}

${
  examData.materials.length > 0
    ? `\n\n수업 자료 파일:
${examData.materials
  .map((file, index) => `${index + 1}. ${file.name}`)
  .join("\n")}
\n위 수업 자료 파일을 참고하여 문제를 만들어야 합니다.`
    : ""
}

요구사항:
1. 기존 문제를 바탕으로 사용자의 요청사항을 반영하여 수정하세요.
2. 문제의 교육적 가치를 유지하면서 요청사항을 충족시키세요.
3. 정답을 직접 제공하지 말고, 학생이 사고력을 발휘할 수 있도록 하세요.
4. 수정된 문제의 핵심 역량을 함께 제안해주세요.
${
  rubric.length > 0
    ? "5. 평가 루브릭의 기준을 반영하여 평가가 가능한 문제를 만들어주세요."
    : ""
}
${
  examData.materials.length > 0
    ? "6. 수업 자료의 내용을 충실히 반영하여 실질적인 학습 내용을 다루어주세요."
    : ""
}

응답 형식:
문제: [수정된 문제 내용]

핵심 역량: [문제의 핵심 역량 설명]`;
      } else {
        // AI 명령어가 없는 경우 - 새 문제 생성
        prompt = `당신은 전문 시험 출제자입니다. 다음 정보를 바탕으로 적절한 시험 문제를 1개 생성해주세요.

시험 정보:
- 제목: ${examData.title}
${examData.description ? `- 설명: ${examData.description}` : ""}
- 시간: ${examData.duration}분

${
  rubric.length > 0
    ? `\n평가 루브릭:
${rubric
  .map(
    (item) =>
      `- ${item.evaluationArea}: ${item.detailedCriteria} (비중: ${item.weight}%)`
  )
  .join("\n")}
\n위 루브릭의 평가 기준에 맞는 문제를 만들어야 합니다.`
    : ""
}

${
  examData.materials.length > 0
    ? `\n\n수업 자료 파일:
${examData.materials
  .map((file, index) => `${index + 1}. ${file.name}`)
  .join("\n")}
\n위 수업 자료 파일을 참고하여 문제를 만들어야 합니다.`
    : ""
}

요구사항:
1. 시험의 난이도와 내용에 맞는 적절한 문제를 생성하세요.
2. 문제는 명확하고 교육적으로 의미 있어야 합니다.
3. 정답을 직접 제공하지 말고, 학생이 사고력을 발휘할 수 있도록 하세요.
4. 문제의 핵심 역량을 함께 제안해주세요.
${
  rubric.length > 0
    ? "5. 평가 루브릭의 기준을 반영하여 평가가 가능한 문제를 만들어주세요."
    : ""
}
${
  examData.materials.length > 0
    ? "6. 수업 자료의 내용을 충실히 반영하여 실질적인 학습 내용을 다루어주세요."
    : ""
}

응답 형식:
문제: [생성된 문제 내용]

핵심 역량: [문제의 핵심 역량 설명]`;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: prompt,
          sessionId: "temp_generate_question",
          examTitle: examData.title,
          examCode: examData.code,
        }),
      });

      if (!response.ok) {
        throw new Error("AI 문제 생성에 실패했습니다.");
      }

      const data = await response.json();
      const aiResponse = data.response;

      // AI 응답에서 문제와 핵심 역량을 파싱
      const problemMatch = aiResponse.match(/문제:\s*(.+?)(?:\n|$)/);
      const coreAbilityMatch = aiResponse.match(/핵심 역량:\s*(.+?)(?:\n|$)/);

      const problemText = problemMatch ? problemMatch[1].trim() : aiResponse;
      const coreAbilityText = coreAbilityMatch
        ? coreAbilityMatch[1].trim()
        : "문제 해결 능력";

      // 해당 문제 업데이트
      setQuestions(
        questions.map((q) =>
          q.id === questionId
            ? {
                ...q,
                text: problemText,
                core_ability: coreAbilityText,
                isAutoGenerated: true,
                isGenerating: false,
                aiCommand:
                  currentQuestion.aiCommand && currentQuestion.aiCommand.trim()
                    ? "" // 명령어 사용 후 초기화
                    : q.aiCommand,
              }
            : q
        )
      );
    } catch (error) {
      console.error("AI 문제 생성 오류:", error);
      alert("문제 생성 중 오류가 발생했습니다. 다시 시도해주세요.");

      // 에러 발생 시 로딩 상태 해제
      setQuestions(
        questions.map((q) =>
          q.id === questionId ? { ...q, isGenerating: false } : q
        )
      );
    }
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
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    const maxSize = 50 * 1024 * 1024; // 50MB (will be compressed)

    if (!allowedTypes.includes(file.type)) {
      alert(
        "지원되지 않는 파일 형식입니다. PDF, PPT, 워드, 이미지 파일만 업로드 가능합니다."
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
      core_ability: "", // 문제 핵심 역량 초기화
      isAutoGenerated: false, // 기본적으로 직접쓰기 모드
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
    // 기존 항목들의 weight를 균등하게 재분배 (5단위로)
    const totalItems = rubric.length + 1;
    const equalWeight = Math.floor(100 / totalItems / 5) * 5;
    const remainder = 100 - equalWeight * totalItems;

    const updatedRubric = rubric.map((item, index) => ({
      ...item,
      weight: equalWeight + (index < remainder ? 5 : 0),
    }));

    const newRubricItem: RubricItem = {
      id: Date.now().toString(),
      evaluationArea: "",
      detailedCriteria: "",
      weight: equalWeight + (rubric.length < remainder ? 5 : 0),
    };

    setRubric([...updatedRubric, newRubricItem]);
  };

  const updateRubricItem = (
    id: string,
    field: keyof RubricItem,
    value: string | number
  ) => {
    let updatedRubric = rubric.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    );

    // weight 필드가 변경된 경우 비율을 100%로 조정
    if (field === "weight") {
      const totalWeight = updatedRubric.reduce(
        (sum, item) => sum + item.weight,
        0
      );

      if (totalWeight !== 100) {
        // 비례적으로 조정 (5단위로)
        updatedRubric = updatedRubric.map((item) => ({
          ...item,
          weight: Math.round(((item.weight / totalWeight) * 100) / 5) * 5,
        }));

        // 정확히 100%가 되도록 조정 (5단위로)
        const newTotal = updatedRubric.reduce(
          (sum, item) => sum + item.weight,
          0
        );
        const difference = 100 - newTotal;

        if (difference !== 0) {
          // 5단위로 조정
          const adjustment = Math.round(difference / 5) * 5;
          updatedRubric[0].weight += adjustment;
        }
      }
    }

    setRubric(updatedRubric);
  };

  const removeRubricItem = (id: string) => {
    const newRubric = rubric.filter((item) => item.id !== id);

    // 항목이 남아있으면 비율을 재분배 (5단위로)
    if (newRubric.length > 0) {
      const totalItems = newRubric.length;
      const equalWeight = Math.floor(100 / totalItems / 5) * 5;
      const remainder = 100 - equalWeight * totalItems;

      const updatedRubric = newRubric.map((item, index) => ({
        ...item,
        weight: equalWeight + (index < remainder ? 5 : 0),
      }));

      setRubric(updatedRubric);
    } else {
      setRubric([]);
    }
  };

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
      }

      // Prepare exam data for database
      const examDataForDB = {
        title: examData.title,
        code: examData.code,
        description: examData.description,
        duration: examData.duration,
        questions: questions,
        rubric: rubric, // 루브릭 데이터 추가
        materials: materialUrls, // Array of file URLs
        status: "draft", // Start as draft
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Save to Supabase
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
        console.error("API Error:", errorData);
        throw new Error(
          `Failed to create exam: ${errorData.error || "Unknown error"}`
        );
      }

      const result = await response.json();
      console.log("Exam created successfully:", result);

      // Redirect to exam management page
      router.push("/instructor/exams");
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

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">설명</Label>
            <Textarea
              id="description"
              value={examData.description}
              onChange={(e) =>
                setExamData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="시험에 대한 설명을 입력하세요..."
              rows={3}
            />
          </div>
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
        />

        <RubricTable
          rubric={rubric}
          onAdd={addRubricItem}
          onUpdate={updateRubricItem}
          onRemove={removeRubricItem}
        />

        <QuestionsList
          questions={questions}
          onAdd={addQuestion}
          onUpdate={updateQuestion}
          onRemove={removeQuestion}
          onGenerateAI={generateQuestionWithAI}
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
            {isLoading ? "만들기 중..." : "시험 만들기"}
          </Button>
        </div>
      </form>
    </div>
  );
}
