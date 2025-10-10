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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ExamCodeEntry() {
  const [examCode, setExamCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examCode.trim()) return;

    // Show the instructions dialog
    setShowInstructions(true);
  };

  const handleConfirmAndNavigate = () => {
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

      <AlertDialog open={showInstructions} onOpenChange={setShowInstructions}>
        <AlertDialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-center">
              🧭 Quest-ON 학생 지침 (Student Instructions)
            </AlertDialogTitle>
          </AlertDialogHeader>

          <div className="text-base text-left space-y-4">
            <div className="text-gray-700 dark:text-gray-300">
              Quest-ON은 AI를 활용한 학습 및 평가 플랫폼으로, 여러분이
              &lsquo;무엇을 아는가&rsquo;뿐 아니라{" "}
              <strong>&lsquo;어떻게 사고하고 AI와 상호작용하는가&rsquo;</strong>
              를 함께 평가합니다. 시험을 시작하기 전에 다음 지침을 반드시 숙지해
              주세요.
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">
                  1. Quest-ON 내 AI 사용
                </h3>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                  <li>
                    플랫폼 내에서 제공되는 AI Assistant는 자유롭게 활용할 수
                    있습니다. 문제를 이해하거나, 필요한 정보를 얻거나,
                    아이디어를 정리하는 등 어떠한 방식으로든 사용할 수 있습니다.
                  </li>
                  <li>
                    다만, AI와의 상호작용 내용 또한 평가의 일부가 될 수
                    있습니다. 즉, 여러분이 어떤 질문을 던지고, 어떻게 사고를
                    전개하며, 어떤 결론에 도달하는지의 과정이 함께 평가됩니다.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">
                  2. 외부 AI 및 도구 사용 금지
                </h3>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                  <li>
                    Quest-ON 플랫폼 외부의 모든 AI 도구, 웹사이트, 소프트웨어
                    사용은 금지됩니다. (예: ChatGPT, Claude, Gemini, Copilot 등)
                  </li>
                  <li>
                    모든 탐색, 사고, 작성 과정은 Quest-ON 플랫폼 내부에서만
                    이루어져야 합니다. 이를 위반할 경우 평가 결과가 무효 처리될
                    수 있습니다.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">
                  3. 문제 해결 방식
                </h3>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                  <li>
                    AI는 정답을 &lsquo;제공하는 존재&rsquo;가 아니라, 여러분의
                    사고를 돕는 조력자입니다. 따라서 주어진 문제를 해결하기 위해
                    어떤 정보가 필요한지 스스로 파악하고, 그 정보를 AI로부터
                    효과적으로 이끌어내는 능력이 중요합니다.
                  </li>
                  <li>
                    AI를 어떻게 활용할지는 전적으로 여러분의 자유입니다. 단,
                    논리적 사고력, 명확한 질문력, 비판적 사고가 높은 평가를
                    받습니다.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">4. 평가 기준</h3>
                <div className="mb-2 text-gray-700 dark:text-gray-300">
                  여러분의 성과는 다음 항목을 중심으로 종합적으로 평가됩니다:
                </div>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                  <li>문제의 핵심을 파악하고 논리적으로 접근하는 능력</li>
                  <li>
                    AI와의 상호작용의 질 (질문 명확성, 탐색 과정, 피드백 반영
                    등)
                  </li>
                  <li>분석적 사고와 일관성 있는 논리 전개</li>
                  <li>창의성, 구조화, 근거 제시의 명확성</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">5. 일반 유의사항</h3>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                  <li>
                    시험 중 다른 사람과의 협업, 정보 공유, 외부 검색 등은
                    허용되지 않습니다.
                  </li>
                  <li>
                    필요하다면 플랫폼 내 노트 공간 등을 활용하여 사고 과정을
                    정리할 수 있습니다.
                  </li>
                  <li>
                    시험 종료 전 반드시 모든 답안을 제출했는지 확인하십시오.
                  </li>
                </ul>
              </div>

              <div className="pt-4 border-t">
                <h3 className="font-semibold text-lg mb-2">⚡ 유의</h3>
                <div className="text-gray-700 dark:text-gray-300">
                  Quest-ON은 단순히 &lsquo;정답&rsquo;을 맞히는 시험이 아닙니다.
                  이 시험은 AI 시대의 사고력, 탐구력, 그리고 주도적 문제 해결
                  능력을 평가합니다. AI를 적극적으로 활용하되, AI가 아닌
                  &lsquo;당신의 사고&rsquo;가 중심이 되어야 합니다.
                </div>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction
              onClick={handleConfirmAndNavigate}
              className="w-full sm:w-auto"
            >
              확인하고 시험 시작하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
