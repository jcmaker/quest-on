"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap, LayoutDashboard, Plus, Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { SidebarFooter } from "@/components/dashboard/SidebarFooter";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";

export default function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn, isLoaded, user } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
            <DashboardSidebar
              homeHref="/instructor"
              navItems={navigationItems}
              showToggle
            />
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
