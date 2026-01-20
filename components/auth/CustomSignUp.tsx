"use client";

import { SignUp } from "@clerk/nextjs";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clerkAppearance } from "@/lib/clerk-config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Link from "next/link";
import Image from "next/image";
import { Users, GraduationCap } from "lucide-react";

export function CustomSignUp() {
  const [role, setRole] = useState<"instructor" | "student">("student");
  const [showRoleSelection, setShowRoleSelection] = useState(false);

  // Store selected role in localStorage when user proceeds to signup
  const handleContinue = () => {
    localStorage.setItem("selectedRole", role);
    setShowRoleSelection(true);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Section - Sign Up Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white dark:bg-gray-950">
        <div className="w-full max-w-md space-y-8">
          {!showRoleSelection ? (
            <>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  새로운 계정 만들기
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Quest-On 계정을 만들어보세요
                </p>
              </div>

              <Card className="border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardTitle className="text-lg">사용자 유형 선택</CardTitle>
                  <CardDescription>계정 유형을 선택해주세요</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RadioGroup
                    value={role}
                    onValueChange={(value) =>
                      setRole(value as "instructor" | "student")
                    }
                  >
                    <div className="flex items-center space-x-3 p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer transition-colors">
                      <RadioGroupItem
                        value="instructor"
                        id="instructor"
                        className="mt-0"
                      />
                      <Label
                        htmlFor="instructor"
                        className="flex-1 cursor-pointer space-y-1"
                      >
                        <div className="flex items-center space-x-2">
                          <Users className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                          <span className="font-medium">
                            강사 (시험 출제자)
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          시험을 만들고 관리합니다
                        </p>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer transition-colors">
                      <RadioGroupItem
                        value="student"
                        id="student"
                        className="mt-0"
                      />
                      <Label
                        htmlFor="student"
                        className="flex-1 cursor-pointer space-y-1"
                      >
                        <div className="flex items-center space-x-2">
                          <GraduationCap className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                          <span className="font-medium">
                            학생 (시험 응시자)
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          시험에 참여하고 피드백을 받습니다
                        </p>
                      </Label>
                    </div>
                  </RadioGroup>
                  <Button onClick={handleContinue} className="w-full">
                    계속하기
                  </Button>
                </CardContent>
              </Card>

              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                이미 계정이 있으신가요?{" "}
                <Link
                  href="/sign-in"
                  className="font-medium text-black dark:text-white hover:underline"
                >
                  로그인
                </Link>
              </div>
            </>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  새로운 계정 만들기
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  선택된 역할:{" "}
                  <span className="font-medium">
                    {role === "instructor" ? "강사" : "학생"}
                  </span>
                </p>
              </div>

              <SignUp
                appearance={{
                  ...clerkAppearance,
                  elements: {
                    ...clerkAppearance.elements,
                    // 페이지별 커스터마이징: 카드 스타일 제거 (커스텀 레이아웃 사용)
                    rootBox: "w-full",
                    card: "shadow-none border-0 p-0",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                    // 필드 세로 배치 강제 - 각 필드를 블록 요소로 만들어 위아래 배치
                    formField: "w-full mb-4 block",
                    formFieldLabel: "block mb-1 text-foreground font-medium",
                    formFieldInput: "w-full border-input bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-ring",
                    formFieldRow: "flex flex-col space-y-0 w-full",
                    form: "flex flex-col space-y-4",
                    // 소셜 로그인 버튼 스타일
                    socialButtonsBlock: "mb-6 space-y-2",
                    socialButtonsBlockButton: "w-full border border-input bg-background hover:bg-accent text-foreground",
                    // 회원가입 버튼
                    formButtonPrimary:
                      "bg-black hover:bg-gray-900 text-white w-full mt-4 dark:bg-white dark:hover:bg-gray-100 dark:text-black",
                  },
                }}
                routing="path"
                path="/sign-up"
                signInUrl="/sign-in"
                afterSignUpUrl="/onboarding"
              />

              <Button
                variant="outline"
                onClick={() => setShowRoleSelection(false)}
                className="w-full"
              >
                역할 다시 선택
              </Button>

              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                이미 계정이 있으신가요?{" "}
                <Link
                  href="/sign-in"
                  className="font-medium text-black dark:text-white hover:underline"
                >
                  로그인
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Section - Visual Element */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-8 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="relative w-full aspect-square max-w-sm mx-auto">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 rounded-3xl blur-3xl opacity-50" />
            <div className="relative w-full h-full flex items-center justify-center bg-white/50 dark:bg-gray-800/50 rounded-3xl backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50">
              <div className="space-y-4 p-8">
                <div className="w-24 h-24 mx-auto rounded-2xl flex items-center justify-center shadow-lg">
                  <Image
                    src="/qlogo_icon.png"
                    alt="Quest-On"
                    width={64}
                    height={64}
                    className="w-16 h-16"
                  />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Quest-On
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  AI 기반 시험 플랫폼
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
