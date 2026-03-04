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
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { ErrorAlert } from "@/components/ui/error-alert";

export default function ExamCodeEntry() {
  const [examCode, setExamCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // URL에서 에러 파라미터 확인
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (!errorParam) return;

    const errorMessages: Record<string, string> = {
      already_submitted: "이미 제출한 시험입니다. 재시험은 불가능합니다.",
      exam_not_found: "시험을 찾을 수 없습니다. 시험 코드를 확인해주세요.",
      exam_not_available:
        "현재 응시할 수 없는 시험입니다. 시험이 종료되었거나 비공개 상태입니다.",
      entry_window_closed:
        "시험 입장 시간이 마감되었습니다. 강사에게 문의해주세요.",
      unauthorized: "로그인이 필요합니다. 다시 로그인해주세요.",
      server_error:
        "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      network_error:
        "네트워크 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.",
    };

    setError(
      errorMessages[errorParam] ||
        "알 수 없는 오류가 발생했습니다. 다시 시도해주세요."
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (examCode.length !== 6) return;

    setIsLoading(true);
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
                {error && <ErrorAlert message={error} />}
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

    </div>
  );
}
