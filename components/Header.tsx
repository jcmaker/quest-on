"use client";

import { usePathname } from "next/navigation";
import { useUser, SignInButton, SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/auth/UserMenu";
import Link from "next/link";
import Image from "next/image";
import { GraduationCap, Users, FilePlus, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Header() {
  const { isSignedIn, isLoaded, user } = useUser();
  const pathname = usePathname();

  // Get user role from metadata
  const userRole = (user?.unsafeMetadata?.role as string) || "student";
  const hasRole = Boolean(user?.unsafeMetadata?.role);

  const isLinkActive = (href: string) => {
    if (href === "/instructor") {
      return (
        pathname.startsWith("/instructor") &&
        !pathname.startsWith("/instructor/new")
      );
    } else if (href === "/student") {
      return pathname.startsWith("/student");
    } else if (href === "/join") {
      return pathname.startsWith("/join");
    }
    return pathname.startsWith(href);
  };

  const getLinkClassName = (isActive: boolean) => {
    return cn(
      "flex items-center space-x-2 text-sm font-medium transition-colors",
      isActive
        ? "text-zinc-900 dark:text-zinc-100 font-bold"
        : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
    );
  };

  return (
    <header className="border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-gray-950/95 dark:border-gray-800">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo + Separator + Navigation */}
        <div className="flex items-center space-x-4">
          <Link href="/" className="flex items-center space-x-2 group">
            <div className="flex items-center space-x-2">
              <Image
                src="/qlogo_icon.png"
                alt="Quest-On Logo"
                width={32}
                height={32}
                className="h-8 w-8"
              />
              <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100 italic tracking-tight group-hover:opacity-80 transition-opacity">
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
                  className={getLinkClassName(isLinkActive("/instructor"))}
                  aria-current={
                    isLinkActive("/instructor") ? "page" : undefined
                  }
                >
                  <Users className="h-4 w-4" />
                  <span>대시보드</span>
                </Link>
                <Link
                  href="/instructor/new"
                  className={getLinkClassName(isLinkActive("/instructor/new"))}
                  aria-current={
                    isLinkActive("/instructor/new") ? "page" : undefined
                  }
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
                  className={getLinkClassName(isLinkActive("/student"))}
                  aria-current={isLinkActive("/student") ? "page" : undefined}
                >
                  <GraduationCap className="h-4 w-4" />
                  <span>내 시험</span>
                </Link>
                <Link
                  href="/join"
                  className={getLinkClassName(isLinkActive("/join"))}
                  aria-current={isLinkActive("/join") ? "page" : undefined}
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
