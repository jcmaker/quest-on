"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraduationCap } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent as ShadcnSidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { SidebarFooter } from "@/components/dashboard/SidebarFooter";
import { FileTree } from "@/components/dashboard/FileTree";
import { UserMenu } from "@/components/auth/UserMenu";
import dynamic from "next/dynamic";
import { Menu, XIcon } from "lucide-react";

// 동적 임포트로 아이콘 최적화
const LayoutDashboard = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.LayoutDashboard }))
);
const Plus = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.Plus }))
);

function SidebarContent() {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const pathname = usePathname();
  const { user } = useUser();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const navigationItems = [
    {
      title: "대시보드",
      href: "/instructor",
      icon: LayoutDashboard,
      active: pathname === "/instructor",
    },
    {
      title: "새 시험 생성",
      href: "/instructor/new",
      icon: Plus,
      active: pathname === "/instructor/new",
    },
  ];

  return (
    <>
      <SidebarHeader className="p-2 sm:p-3 border-b border-sidebar-border flex items-center">
        {isCollapsed ? (
          <div className="w-full flex items-center justify-center">
            <Menu 
              className="w-5 h-5 shrink-0 cursor-pointer" 
              aria-hidden="true" 
              onClick={toggleSidebar}
            />
            <span className="sr-only">사이드바 열기</span>
          </div>
        ) : (
          <div className="w-full flex items-center justify-between px-3 sm:px-4">
            <Link
              href="/instructor"
              className="flex items-center flex-shrink-0"
            >
              <Image
                src="/qstn_logo_svg.svg"
                alt="Quest-On Logo"
                width={30}
                height={30}
                className="w-8 h-8 shrink-0"
                priority
              />
              <span className="text-lg font-bold ml-2">Quest-On</span>
            </Link>
            <button
              type="button"
              onClick={toggleSidebar}
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="사이드바 닫기"
            >
              <XIcon className="w-5 h-5" />
              <span className="sr-only">사이드바 닫기</span>
            </button>
          </div>
        )}
      </SidebarHeader>

      <ShadcnSidebarContent>
        <nav
          className="flex-1 p-3 sm:p-4 space-y-1 overflow-y-auto"
          aria-label="주요 네비게이션"
        >
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-sidebar group-data-[collapsible=icon]:justify-center",
                  item.active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                aria-current={item.active ? "page" : undefined}
                title={isCollapsed ? item.title : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                {!isCollapsed && <span>{item.title}</span>}
              </Link>
            );
          })}
        </nav>

        {!isCollapsed && (
          <>
            <div className="border-t border-sidebar-border my-2" />
            <div className="px-3 py-2">
              <h3 className="text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wide mb-2">
                폴더 및 파일
              </h3>
              <FileTree
                userId={user?.id}
                currentFolderId={currentFolderId}
                onFolderClick={(folderId) => {
                  setCurrentFolderId(folderId);
                }}
                className="max-h-[400px]"
              />
            </div>
          </>
        )}
      </ShadcnSidebarContent>

      <SidebarFooter />
    </>
  );
}

export default function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn, isLoaded, user } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Get user role from metadata
  const userRole = (user?.unsafeMetadata?.role as string) || "student";

  // Redirect non-instructors or users without role
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      // Role이 설정되지 않은 경우 onboarding으로 리다이렉트
      if (!user?.unsafeMetadata?.role) {
        router.push("/onboarding");
        return;
      }
      // Role이 instructor가 아닌 경우 student 페이지로 리다이렉트
      if (userRole !== "instructor") {
        router.push("/student");
      }
    }
  }, [isLoaded, isSignedIn, userRole, user, router]);

  return (
    <div className="min-h-screen bg-background">
      <SignedOut>
        <div className="flex items-center justify-center h-screen p-4">
          <Card className="w-full max-w-md shadow-xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="text-center space-y-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
                <GraduationCap
                  className="w-8 h-8 text-primary-foreground"
                  aria-hidden="true"
                />
              </div>
              <CardTitle className="text-xl font-bold">
                로그인이 필요합니다
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                강사 페이지에 접근하려면 로그인해주세요
              </p>
            </CardHeader>
            <CardContent className="text-center pb-8">
              <Button
                onClick={() => router.replace("/sign-in")}
                className="w-full min-h-[44px]"
                aria-label="강사로 로그인"
              >
                강사로 로그인
              </Button>
            </CardContent>
          </Card>
        </div>
      </SignedOut>

      <SignedIn>
        <SidebarProvider
          defaultOpen={true}
          style={
            {
              "--sidebar-width": "16rem",
              "--sidebar-width-icon": "4rem",
            } as React.CSSProperties
          }
        >
          <Sidebar
            side="left"
            variant="sidebar"
            collapsible="icon"
            className="border-r border-sidebar-border"
          >
            <SidebarContent />
          </Sidebar>

          {/* Mobile Sidebar Sheet */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>메뉴</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col h-full bg-sidebar">
                <div className="p-4 sm:p-5 border-b border-sidebar-border">
                  <Link
                    href="/instructor"
                    className="flex items-center justify-center"
                  >
                    <Image
                      src="/qstn_logo_svg.svg"
                      alt="Quest-On Logo"
                      width={40}
                      height={40}
                      className="w-10 h-10"
                      priority
                    />
                    <span className="text-xl font-bold text-sidebar-foreground ml-2">
                      Quest-On
                    </span>
                  </Link>
                </div>
                <nav
                  className="flex-1 p-3 sm:p-4 space-y-1 overflow-y-auto"
                  aria-label="주요 네비게이션"
                >
                  <Link
                    href="/instructor"
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-sidebar",
                      pathname === "/instructor"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                    aria-current={pathname === "/instructor" ? "page" : undefined}
                  >
                    <LayoutDashboard className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span>대시보드</span>
                  </Link>
                  <Link
                    href="/instructor/new"
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-sidebar",
                      pathname === "/instructor/new"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                    aria-current={pathname === "/instructor/new" ? "page" : undefined}
                  >
                    <Plus className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span>새 시험 생성</span>
                  </Link>
                </nav>
                <SidebarFooter />
              </div>
            </SheetContent>
          </Sheet>

          <SidebarInset>
            {/* Main Content Area */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              {/* Top Header */}
              <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                        <SheetTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="lg:hidden min-h-[44px] min-w-[44px] p-0 "
                            aria-label="메뉴 열기"
                          >
                            <Menu className="w-5 h-5" aria-hidden="true" />
                          </Button>
                        </SheetTrigger>
                      </Sheet>

                      
              

              {/* Main Content */}
              <main className="flex-1 overflow-y-auto bg-background">
                {children}
              </main>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </SignedIn>
    </div>
  );
}
