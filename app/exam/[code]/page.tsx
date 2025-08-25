"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";

interface Question {
  id: string;
  text: string;
  type: string;
  points: number;
}

interface Exam {
  id: string;
  title: string;
  code: string;
  description: string;
  duration: number;
  questions: Question[];
  startTime?: string;
  endTime?: string;
}

export default function ExamPage() {
  const params = useParams();
  const router = useRouter();
  const { signOut } = useClerk();
  const examCode = params.code as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<
    Array<{ type: "user" | "assistant"; message: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Mock exam data - replace with actual data from Supabase
  useEffect(() => {
    const mockExam: Exam = {
      id: "1",
      title: "수학 101 중간고사",
      code: examCode,
      description: "대수학과 미적분학을 다루는 종합적인 중간고사",
      duration: 90,
      questions: [
        {
          id: "1",
          text: "이차방정식을 풀어라: x² + 5x + 6 = 0",
          type: "essay",
          points: 25,
        },
        {
          id: "2",
          text: "f(x) = x³ + 2x² - 5x + 1의 도함수를 구하라",
          type: "essay",
          points: 30,
        },
        {
          id: "3",
          text: "적분을 계산하라: ∫(2x + 3)dx",
          type: "essay",
          points: 25,
        },
        {
          id: "4",
          text: "미적분학에서 극한의 개념을 설명하라",
          type: "essay",
          points: 20,
        },
      ],
      startTime: new Date().toISOString(),
    };
    setExam(mockExam);
    setTimeRemaining(mockExam.duration * 60);
  }, [examCode]);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Auto-submit when time runs out
          router.push(`/exam/${examCode}/answer`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining, examCode, router]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const sendChatMessage = async () => {
    if (!chatMessage.trim()) return;

    const userMessage = { type: "user" as const, message: chatMessage };
    setChatHistory((prev) => [...prev, userMessage]);
    setChatMessage("");
    setIsLoading(true);

    try {
      // TODO: Call API for clarification response
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: chatMessage,
          examCode,
          questionId: exam?.questions[currentQuestion]?.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMessage = {
          type: "assistant" as const,
          message: data.response,
        };
        setChatHistory((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error("Error sending chat message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!exam) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">시험 로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header with timer */}
      <div className="bg-white dark:bg-gray-800 border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{exam.title}</h1>
              <p className="text-muted-foreground">코드: {exam.code}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-red-600">
                {formatTime(timeRemaining)}
              </div>
              <p className="text-sm text-muted-foreground">남은 시간</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut()}
                className="text-red-600 hover:text-red-700 mt-2"
              >
                로그아웃
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Questions */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    문제 {currentQuestion + 1} / {exam.questions.length}
                  </CardTitle>
                  <Badge variant="outline">
                    {exam.questions[currentQuestion]?.points}점
                  </Badge>
                </div>
                <CardDescription>
                  {exam.questions[currentQuestion]?.type === "essay"
                    ? "서술형"
                    : exam.questions[currentQuestion]?.type === "short-answer"
                    ? "단답형"
                    : exam.questions[currentQuestion]?.type ===
                      "multiple-choice"
                    ? "객관식"
                    : exam.questions[currentQuestion]?.type}{" "}
                  문제
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none">
                  <p className="text-lg leading-relaxed">
                    {exam.questions[currentQuestion]?.text}
                  </p>
                </div>

                <div className="mt-6">
                  <Label className="text-sm font-medium">답안 (초안)</Label>
                  <Textarea
                    placeholder="여기에 답안을 작성하세요..."
                    className="mt-2 min-h-[200px]"
                    readOnly
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    최종 답안을 제출하려면 답안 페이지로 이동하세요
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() =>
                  setCurrentQuestion((prev) => Math.max(0, prev - 1))
                }
                disabled={currentQuestion === 0}
              >
                이전 문제
              </Button>
              <Button
                onClick={() =>
                  setCurrentQuestion((prev) =>
                    Math.min(exam.questions.length - 1, prev + 1)
                  )
                }
                disabled={currentQuestion === exam.questions.length - 1}
              >
                다음 문제
              </Button>
            </div>
          </div>

          {/* Chat and Actions */}
          <div className="space-y-6">
            {/* Chat for clarification */}
            <Card>
              <CardHeader>
                <CardTitle>질문하기</CardTitle>
                <CardDescription>
                  문제를 이해하는 데 도움이 필요하신가요?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Input
                    placeholder="질문을 입력하세요..."
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && sendChatMessage()}
                  />
                  <Button
                    onClick={sendChatMessage}
                    disabled={isLoading || !chatMessage.trim()}
                    className="w-full"
                  >
                    {isLoading ? "전송 중..." : "질문하기"}
                  </Button>
                </div>

                {/* Chat history */}
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {chatHistory.map((msg, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg ${
                        msg.type === "user"
                          ? "bg-blue-100 dark:bg-blue-900 ml-4"
                          : "bg-gray-100 dark:bg-gray-800 mr-4"
                      }`}
                    >
                      <p className="text-sm">{msg.message}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>빠른 작업</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link href={`/exam/${examCode}/answer`} className="w-full">
                  <Button className="w-full">답안 페이지로 이동</Button>
                </Link>
                <Button variant="outline" className="w-full">
                  진행 상황 저장
                </Button>
                <Button variant="outline" className="w-full">
                  모든 문제 검토
                </Button>
              </CardContent>
            </Card>

            {/* Question Navigation */}
            <Card>
              <CardHeader>
                <CardTitle>문제 탐색</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {exam.questions.map((_, index) => (
                    <Button
                      key={index}
                      variant={
                        currentQuestion === index ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setCurrentQuestion(index)}
                      className="h-10 w-10 p-0"
                    >
                      {index + 1}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
