"use client";

import { useUser, SignInButton, SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/auth/UserMenu";
import Link from "next/link";
import Image from "next/image";
import { GraduationCap, Users, FilePlus, UserPlus } from "lucide-react";

export function Header() {
  const { isSignedIn, isLoaded, user } = useUser();

  // Get user role from metadata
  const userRole = (user?.unsafeMetadata?.role as string) || "student";
  const hasRole = Boolean(user?.unsafeMetadata?.role);

  return (
    <header className="border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-gray-950/95 dark:border-gray-800">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo + Separator + Navigation */}
        <div className="flex items-center space-x-4">
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex items-center space-x-2">
              <Image
                src="/qlogo_icon.png"
                alt="Quest-On Logo"
                width={32}
                height={32}
                className="h-8 w-8"
              />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Quest-On
              </span>
            </div>
          </Link>

          {/* Vertical Separator */}
          {isSignedIn && hasRole && (
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
          )}

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            {isSignedIn && hasRole && userRole === "instructor" && (
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
                  <FilePlus className="h-4 w-4" />
                  <span>시험 만들기</span>
                </Link>
              </>
            )}
            {isSignedIn && hasRole && userRole === "student" && (
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
                  <UserPlus className="h-4 w-4" />
                  <span>시험 참여</span>
                </Link>
              </>
            )}
            {/* Role이 설정되지 않은 사용자에게는 네비게이션을 보여주지 않음 */}
          </nav>
        </div>

        {/* Auth Section */}
        <div className="flex items-center space-x-4">
          {isLoaded && (
            <>
              {isSignedIn ? (
                <UserMenu />
              ) : (
                <div className="flex items-center space-x-2">
                  <SignInButton>
                    <Button variant="outline" size="sm">
                      로그인
                    </Button>
                  </SignInButton>
                  <SignUpButton>
                    <Button size="sm">회원가입</Button>
                  </SignUpButton>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
