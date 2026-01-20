"use client";

import * as Clerk from "@clerk/elements/common";
import * as SignIn from "@clerk/elements/sign-in";
import Link from "next/link";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function CustomSignIn() {
  return (
    <div className="flex min-h-screen">
      {/* Left Section - Sign In Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white dark:bg-gray-950">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Quest-On에 오신 것을 환영합니다
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Quest-On 계정에 로그인하세요
            </p>
          </div>

          <SignIn.Root>
            <SignIn.Step name="start" className="space-y-6">
              {/* 소셜 로그인 버튼들 */}
              <div className="space-y-2">
                <Clerk.Connection name="google" asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full min-h-[44px]"
                  >
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    <span className="font-medium">Google로 계속하기</span>
                  </Button>
                </Clerk.Connection>

                <Clerk.Connection name="microsoft" asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full min-h-[44px]"
                  >
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 23 23"
                      fill="none"
                    >
                      <path d="M0 0h11.5v11.5H0V0z" fill="#F25022" />
                      <path d="M11.5 0H23v11.5H11.5V0z" fill="#7FBA00" />
                      <path d="M0 11.5h11.5V23H0V11.5z" fill="#00A4EF" />
                      <path d="M11.5 11.5H23V23H11.5V11.5z" fill="#FFB900" />
                    </svg>
                    <span className="font-medium">Microsoft로 계속하기</span>
                  </Button>
                </Clerk.Connection>
              </div>

              {/* 구분선 */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    또는
                  </span>
                </div>
              </div>

              {/* 이메일 입력 필드 */}
              <Clerk.Field name="identifier" className="space-y-2">
                <Clerk.Label asChild>
                  <Label>이메일 주소</Label>
                </Clerk.Label>
                <Clerk.Input type="email" asChild>
                  <Input placeholder="이메일 주소를 입력하세요" />
                </Clerk.Input>
                <Clerk.FieldError className="text-sm text-destructive mt-1" />
              </Clerk.Field>

              {/* 비밀번호 입력 필드 - Strategy 없이 직접 배치하여 항상 표시 */}
              <Clerk.Field name="password" className="space-y-2">
                <Clerk.Label asChild>
                  <Label>비밀번호</Label>
                </Clerk.Label>
                <Clerk.Input type="password" asChild>
                  <Input placeholder="비밀번호를 입력하세요" />
                </Clerk.Input>
                <Clerk.FieldError className="text-sm text-destructive mt-1" />
              </Clerk.Field>

              {/* 로그인 버튼 */}
              <SignIn.Action submit asChild>
                <Button className="w-full min-h-[44px]" size="lg" type="submit">
                  <span className="font-bold">로그인</span>
                </Button>
              </SignIn.Action>
            </SignIn.Step>
          </SignIn.Root>

          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            계정이 없으신가요?{" "}
            <Link
              href="/sign-up"
              className="font-medium text-black dark:text-white hover:underline"
            >
              회원가입
            </Link>
          </div>
        </div>
      </div>

      {/* Right Section - Visual Element */}
      <div 
        className="hidden lg:flex flex-1 items-center justify-center p-8 relative overflow-hidden"
        style={{ backgroundColor: '#365FC6' }}
      >
        <div className="relative w-full h-full flex items-center justify-center">
          <Image
            src="/wqstn.png"
            alt="Quest-On"
            width={400}
            height={400}
            className="w-auto h-auto max-w-[80%] max-h-[80%] object-contain"
            priority
          />
        </div>
      </div>
    </div>
  );
}
