"use client";

import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";

export function CustomSignIn() {
  return (
    <div className="flex min-h-screen">
      {/* Left Section - Sign In Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white dark:bg-gray-950">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              다시 오신 것을 환영합니다
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Quest-On 계정에 로그인하세요
            </p>
          </div>

          <SignIn
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none border-0 p-0",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                socialButtonsBlockButton:
                  "border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900",
                socialButtonsBlockButtonText:
                  "text-gray-700 dark:text-gray-300 font-medium",
                formButtonPrimary:
                  "bg-black hover:bg-gray-900 text-white w-full",
                formFieldInput:
                  "border-gray-300 dark:border-gray-700 focus:border-black dark:focus:border-white",
                footerActionLink: "text-black dark:text-white hover:underline",
                formFieldLabel: "text-gray-700 dark:text-gray-300",
                dividerLine: "bg-gray-200 dark:bg-gray-800",
                dividerText: "text-gray-500 dark:text-gray-400",
              },
            }}
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
          />

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
