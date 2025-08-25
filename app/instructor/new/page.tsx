"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";

export default function CreateExam() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [examData, setExamData] = useState({
    title: "",
    description: "",
    duration: 60,
    code: "",
  });
  const [questions, setQuestions] = useState<Question[]>([]);

  interface Question {
    id: string;
    text: string;
    type: "multiple-choice" | "essay" | "short-answer";
    options?: string[];
    correctAnswer?: string;
  }

  const generateExamCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setExamData((prev) => ({ ...prev, code: result }));
  };

  const addQuestion = () => {
    const newQuestion: Question = {
      id: Date.now().toString(),
      text: "",
      type: "essay",
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (id: string, field: keyof Question, value: string) => {
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, [field]: value } : q))
    );
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examData.title || !examData.code || questions.length === 0) return;

    setIsLoading(true);

    try {
      // Prepare exam data for database
      const examDataForDB = {
        title: examData.title,
        code: examData.code,
        description: examData.description,
        duration: examData.duration,
        questions: questions,
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Exam Info */}
        <Card>
          <CardHeader>
            <CardTitle>시험 정보</CardTitle>
            <CardDescription>시험의 기본 세부사항</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">시험 제목</Label>
                <Input
                  id="title"
                  value={examData.title}
                  onChange={(e) =>
                    setExamData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="예: 수학 101 중간고사"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">시험 코드</Label>
                <div className="flex gap-2">
                  <Input
                    id="code"
                    value={examData.code}
                    onChange={(e) =>
                      setExamData((prev) => ({
                        ...prev,
                        code: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="예: MATH101"
                    className="font-mono"
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generateExamCode}
                  >
                    생성
                  </Button>
                </div>
              </div>
            </div>
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
                placeholder="시험에 대한 간단한 설명"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">시간 (분)</Label>
              <Input
                id="duration"
                type="number"
                value={examData.duration}
                onChange={(e) =>
                  setExamData((prev) => ({
                    ...prev,
                    duration: parseInt(e.target.value),
                  }))
                }
                min="15"
                max="480"
              />
            </div>
          </CardContent>
        </Card>

        {/* Questions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>문제</CardTitle>
                <CardDescription>시험에 문제를 추가하세요</CardDescription>
              </div>
              <Button type="button" onClick={addQuestion}>
                문제 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {questions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>아직 추가된 문제가 없습니다.</p>
                <p>&quot;문제 추가&quot;를 클릭하여 시작하세요!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {questions.map((question, index) => (
                  <div key={question.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">문제 {index + 1}</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeQuestion(question.id)}
                      >
                        삭제
                      </Button>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>문제 유형</Label>
                        <select
                          value={question.type}
                          onChange={(e) =>
                            updateQuestion(question.id, "type", e.target.value)
                          }
                          className="w-full p-2 border rounded-md"
                        >
                          <option value="essay">서술형</option>
                          <option value="short-answer" disabled>
                            단답형
                          </option>
                          <option value="multiple-choice" disabled>
                            객관식
                          </option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>문제 내용</Label>
                        <Textarea
                          value={question.text}
                          onChange={(e) =>
                            updateQuestion(question.id, "text", e.target.value)
                          }
                          placeholder="여기에 문제를 입력하세요..."
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
            disabled={
              isLoading ||
              !examData.title ||
              !examData.code ||
              questions.length === 0
            }
          >
            {isLoading ? "만들기 중..." : "시험 만들기"}
          </Button>
        </div>
      </form>
    </div>
  );
}
