"use client";

import { useUser, SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/auth/UserMenu";
import Link from "next/link";
import { BookOpen, GraduationCap, Users } from "lucide-react";

export function Header() {
  const { isSignedIn, isLoaded, user } = useUser();

  // Get user role from metadata
  const userRole = (user?.unsafeMetadata?.role as string) || "student";

  return (
    <header className="border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-gray-950/95 dark:border-gray-800">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2">
          <div className="flex items-center space-x-2">
            <img
              src="/qlogo_icon.png"
              alt="Quest-On Logo"
              className="h-8 w-8"
            />
            <span className="text-xl font-bold text-gray-900 dark:text-white">
              Quest-On
            </span>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center space-x-6">
          {isSignedIn && userRole === "instructor" && (
            <>
              <Link
                href="/instructor"
                className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors"
              >
                <Users className="h-4 w-4" />
                <span>대시보드</span>
              </Link>
              <Link
                href="/instructor/new"
                className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors"
              >
                <span>새 시험 만들기</span>
              </Link>
            </>
          )}
          {isSignedIn && userRole === "student" && (
            <>
              <Link
                href="/student"
                className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors"
              >
                <GraduationCap className="h-4 w-4" />
                <span>내 시험</span>
              </Link>
              <Link
                href="/join"
                className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors"
              >
                <span>시험 참여</span>
              </Link>
            </>
          )}
          {/* {!isSignedIn && (
            <>
              <Link
                href="/join"
                className="text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors"
              >
                학생용
              </Link>
            </>
          )} */}
        </nav>

        {/* Auth Section */}
        <div className="flex items-center space-x-4">
          {isLoaded && (
            <>
              {isSignedIn ? (
                <UserMenu />
              ) : (
                <div className="flex items-center space-x-2">
                  <SignInButton mode="modal">
                    <Button variant="outline" size="sm">
                      로그인
                    </Button>
                  </SignInButton>
                  <SignInButton mode="modal">
                    <Button size="sm">회원가입</Button>
                  </SignInButton>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
