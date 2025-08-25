"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export default function LandingPage() {
  const { isSignedIn, isLoaded, user } = useUser();
  const router = useRouter();

  // Get user role from metadata
  const userRole = (user?.unsafeMetadata?.role as string) || "student";

  // Redirect instructors to their dashboard
  useEffect(() => {
    if (isLoaded && isSignedIn && userRole === "instructor") {
      router.push("/instructor");
    }
  }, [isLoaded, isSignedIn, userRole, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Quest-On에 오신 것을 환영합니다
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            강사와 학생을 연결하는 현대적인 학습 플랫폼으로, 흥미롭고
            상호작용적인 환경을 제공합니다.
          </p>
        </div>

        <div
          className={`grid gap-8 max-w-4xl mx-auto mb-16 ${
            !isSignedIn || userRole === "instructor"
              ? "md:grid-cols-2"
              : "md:grid-cols-1"
          }`}
        >
          {(!isSignedIn || userRole === "instructor") && (
            <Card className="p-8 text-center">
              <CardHeader>
                <CardTitle className="text-2xl">강사용</CardTitle>
                <CardDescription>
                  흥미로운 시험을 만들고, 학생을 관리하며, 진행 상황을
                  추적하세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/instructor">
                  <Button size="lg" className="w-full">
                    강사 대시보드로 이동
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          <Card className="p-8 text-center">
            <CardHeader>
              <CardTitle className="text-2xl">학생용</CardTitle>
              <CardDescription>
                시험 코드를 입력하고 AI 피드백과 함께 시험을 치세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/join">
                <Button size="lg" className="w-full">
                  시험 코드 입력
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            {isSignedIn && userRole === "student"
              ? "시험에 참여하려면 위의 카드를 클릭하세요"
              : "시작하려면 위의 로그인 버튼을 클릭하거나 카드를 선택하세요"}
          </p>
        </div>
      </div>
    </div>
  );
}
