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
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ExamCodeEntry() {
  const [examCode, setExamCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examCode.trim()) return;

    setIsLoading(true);

    // Navigate to the exam page with the code
    router.push(`/exam/${examCode.trim()}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            시험 코드 입력
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            강사가 제공한 시험 코드를 입력하여 시험을 시작하세요
          </p>
        </div>

        <div className="max-w-md mx-auto">
          <Card className="p-8">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">시험 코드</CardTitle>
              <CardDescription>
                시작하려면 고유한 시험 코드를 입력하세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="examCode">시험 코드</Label>
                  <Input
                    id="examCode"
                    type="text"
                    placeholder="시험 코드 입력 (예: MATH101)"
                    value={examCode}
                    onChange={(e) => setExamCode(e.target.value)}
                    className="text-center text-lg font-mono"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isLoading || !examCode.trim()}
                >
                  {isLoading ? "입력 중..." : "시험 입장"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-8">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            도움이 필요하신가요? 강사에게 문의하세요
          </p>
          <Link href="/">
            <Button variant="outline">홈으로 돌아가기</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
