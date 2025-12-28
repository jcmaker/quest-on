"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export default function RegradePage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const examId = params.examId as string;
  const studentId = params.studentId as string;
  const [status, setStatus] = useState<
    "loading" | "success" | "error" | "no-session"
  >("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const triggerRegrade = async () => {
      if (!isLoaded || !user || !examId || !studentId) return;

      try {
        // Note: studentId in URL is actually sessionId (see grade page.tsx:148)
        const sessionId = studentId;

        // AI 채점 재실행
        const gradeResponse = await fetch(`/api/session/${sessionId}/grade`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            forceRegrade: false,
          }),
        });

        if (!gradeResponse.ok) {
          const errorData = await gradeResponse.json().catch(() => ({}));
          throw new Error(
            errorData.error || errorData.message || "채점 재실행에 실패했습니다"
          );
        }

        const gradeData = await gradeResponse.json();
        setStatus("success");
        setMessage(
          gradeData.skipped
            ? "이미 채점이 완료되어 있습니다."
            : `가채점이 완료되었습니다. (${gradeData.gradesCount || 0}개 문제)`
        );

        // 2초 후 채점 페이지로 리다이렉트
        setTimeout(() => {
          router.push(`/instructor/${examId}/grade/${studentId}`);
        }, 2000);
      } catch (error) {
        console.error("가채점 실패:", error);
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "가채점 실행 중 오류가 발생했습니다"
        );
      }
    };

    triggerRegrade();
  }, [examId, studentId, user, isLoaded, router]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>로그인이 필요합니다</CardTitle>
            <CardDescription>
              가채점을 실행하려면 로그인이 필요합니다.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            {status === "loading" && (
              <Loader2 className="w-16 h-16 animate-spin text-primary" />
            )}
            {status === "success" && (
              <CheckCircle2 className="w-16 h-16 text-green-600" />
            )}
            {(status === "error" || status === "no-session") && (
              <AlertCircle className="w-16 h-16 text-destructive" />
            )}
          </div>
          <CardTitle>
            {status === "loading" && "가채점 실행 중..."}
            {status === "success" && "가채점 완료"}
            {status === "error" && "오류 발생"}
            {status === "no-session" && "세션 없음"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <CardDescription className="mb-4">{message}</CardDescription>
          {status === "success" && (
            <p className="text-sm text-muted-foreground">
              잠시 후 채점 페이지로 이동합니다...
            </p>
          )}
          {status === "error" && (
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              다시 시도
            </button>
          )}
          {status === "no-session" && (
            <button
              onClick={() => router.push(`/instructor/${examId}/grade/${studentId}`)}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              채점 페이지로 돌아가기
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

