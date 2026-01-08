"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { FileText } from "lucide-react";

export default function ExamCodeEntry() {
  const [examCode, setExamCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // URL에서 에러 파라미터 확인
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam === "already_submitted") {
      setError("이미 제출한 시험입니다. 재시험은 불가능합니다.");
    } else if (errorParam === "exam_not_found") {
      setError("시험을 찾을 수 없습니다. 시험 코드를 확인해주세요.");
    } else if (errorParam === "network_error") {
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (examCode.length !== 6) return;

    // Show the instructions dialog
    setShowInstructions(true);
  };

  const handleConfirmAndNavigate = () => {
    setIsLoading(true);
    // Navigate to the exam page with the code
    router.push(`/exam/${examCode}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="max-w-md mx-auto">
          <Card className="shadow-xl border-0">
            <CardHeader className="text-center pb-6">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-primary-foreground" />
              </div>
              <CardTitle className="text-2xl">시험 코드 입력</CardTitle>
              <CardDescription className="text-base">
                강사가 제공한 시험 코드를 입력하여 시험을 시작하세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}
                <div className="space-y-2 mb-12">
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                      value={examCode}
                      onChange={(value) => {
                        setExamCode(value.toUpperCase());
                        setError(null); // 입력 시 에러 메시지 초기화
                      }}
                      className="gap-1"
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={1} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={2} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={3} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={4} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={5} className="h-12 w-12 text-lg" />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    영문자와 숫자만 입력 가능합니다 (예: MATH01)
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || examCode.length !== 6}
                >
                  {isLoading ? "입력 중..." : "시험 입장"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-8">
          <p className="text-muted-foreground mb-4">
            도움이 필요하신가요? 강사에게 문의하세요
          </p>
          <Link href="/">
            <Button variant="outline">홈으로 돌아가기</Button>
          </Link>
        </div>
      </div>

      <AlertDialog open={showInstructions} onOpenChange={setShowInstructions}>
        <AlertDialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto p-8">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-center flex flex-col items-center justify-center gap-2">
              <Image
                src="/qlogo_icon.png"
                alt="Quest-ON Logo"
                width={64}
                height={64}
                className="inline-block"
              />
              학생 지침
            </AlertDialogTitle>
          </AlertDialogHeader>

          <div className="text-base text-left space-y-4">
            <div className="text-gray-700 dark:text-gray-300">
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                Quest-ON
              </span>
              은 AI를 활용한 학습 및 평가 플랫폼으로, 여러분이 &lsquo;무엇을
              아는가&rsquo;뿐 아니라{" "}
              <strong className="text-blue-600 dark:text-blue-400">
                &lsquo;어떻게 사고하고 AI와 상호작용하는가&rsquo;
              </strong>
              를 함께 평가합니다. 시험을 시작하기 전에 다음 지침을{" "}
              <span className="text-red-600 dark:text-red-400 font-semibold">
                반드시 숙지
              </span>
              해 주세요.
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2 text-blue-700 dark:text-blue-400">
                  1. Quest-ON 내 AI 사용
                </h3>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                  <li>
                    플랫폼 내에서 제공되는{" "}
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      AI Assistant
                    </span>
                    는{" "}
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">
                      자유롭게 활용
                    </span>
                    할 수 있습니다. 문제를 이해하거나, 필요한 정보를 얻거나,
                    아이디어를 정리하는 등 어떠한 방식으로든 사용할 수 있습니다.
                  </li>
                  <li>
                    다만,{" "}
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      AI와의 상호작용 내용 또한 평가의 일부
                    </span>
                    가 될 수 있습니다. 즉, 여러분이 어떤 질문을 던지고, 어떻게
                    사고를 전개하며, 어떤 결론에 도달하는지의 과정이 함께
                    평가됩니다.
                  </li>
                </ul>
              </div>

              <div className="bg-red-50 dark:bg-red-950/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
                <h3 className="font-semibold text-lg mb-2 text-red-700 dark:text-red-400">
                  2. 외부 AI 및 도구 사용{" "}
                  <span className="text-red-600 dark:text-red-400 font-bold">
                    금지
                  </span>
                </h3>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                  <li>
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      Quest-ON
                    </span>{" "}
                    플랫폼{" "}
                    <span className="text-red-600 dark:text-red-400 font-semibold">
                      외부의 모든 AI 도구, 웹사이트, 소프트웨어 사용은 금지
                    </span>
                    됩니다. (예:{" "}
                    <span className="font-mono text-sm bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                      ChatGPT, Claude, Gemini, Copilot
                    </span>{" "}
                    등)
                  </li>
                  <li>
                    모든 탐색, 사고, 작성 과정은 Quest-ON 플랫폼 내부에서만
                    이루어져야 합니다.{" "}
                    <span className="text-red-600 dark:text-red-400 font-semibold">
                      이를 위반할 경우 평가 결과가 무효 처리
                    </span>
                    될 수 있습니다.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2 text-blue-700 dark:text-blue-400">
                  3. 문제 해결 방식
                </h3>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                  <li>
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      AI
                    </span>
                    는 정답을 &lsquo;제공하는 존재&rsquo;가 아니라, 여러분의
                    사고를 돕는 조력자입니다. 따라서 주어진 문제를 해결하기 위해
                    어떤 정보가 필요한지 스스로 파악하고, 그 정보를 AI로부터
                    효과적으로 이끌어내는 능력이 중요합니다.
                  </li>
                  <li>
                    AI를 어떻게 활용할지는 전적으로 여러분의 자유입니다. 단,{" "}
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">
                      논리적 사고력, 명확한 질문력, 비판적 사고
                    </span>
                    가 높은 평가를 받습니다.
                  </li>
                </ul>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="font-semibold text-lg mb-2 text-blue-700 dark:text-blue-400">
                  4. 평가 기준
                </h3>
                <div className="mb-2 text-gray-700 dark:text-gray-300">
                  여러분의 성과는 다음 항목을 중심으로 종합적으로 평가됩니다:
                </div>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                  <li>
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      문제의 핵심을 파악
                    </span>
                    하고{" "}
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      논리적으로 접근
                    </span>
                    하는 능력
                  </li>
                  <li>
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      AI와의 상호작용의 질
                    </span>{" "}
                    (질문 명확성, 탐색 과정, 피드백 반영 등)
                  </li>
                  <li>
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      분석적 사고
                    </span>
                    와{" "}
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      일관성 있는 논리 전개
                    </span>
                  </li>
                  <li>
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      창의성, 구조화, 근거 제시의 명확성
                    </span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2 text-gray-800 dark:text-gray-200">
                  5. 일반 유의사항
                </h3>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                  <li>
                    시험 중{" "}
                    <span className="text-red-600 dark:text-red-400 font-semibold">
                      다른 사람과의 협업, 정보 공유, 외부 검색 등은 허용되지
                      않습니다.
                    </span>
                  </li>
                  <li>
                    필요하다면 플랫폼 내 노트 공간 등을 활용하여 사고 과정을
                    정리할 수 있습니다.
                  </li>
                  <li>
                    시험 종료 전{" "}
                    <span className="text-red-600 dark:text-red-400 font-semibold">
                      반드시 모든 답안을 제출
                    </span>
                    했는지 확인하십시오.
                  </li>
                </ul>
              </div>

              <div className="pt-4 border-t-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
                <h3 className="font-semibold text-lg mb-2 text-blue-700 dark:text-blue-400">
                  ⚡ 유의
                </h3>
                <div className="text-gray-700 dark:text-gray-300">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">
                    Quest-ON
                  </span>
                  은 단순히 &lsquo;정답&rsquo;을 맞히는 시험이 아닙니다. 이
                  시험은{" "}
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">
                    AI 시대의 사고력, 탐구력, 그리고 주도적 문제 해결 능력
                  </span>
                  을 평가합니다. AI를 적극적으로 활용하되, AI가 아닌{" "}
                  <span className="text-blue-600 dark:text-blue-400 font-bold">
                    &lsquo;당신의 사고&rsquo;가 중심
                  </span>
                  이 되어야 합니다.
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
