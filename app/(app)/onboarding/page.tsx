"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CenteredViewportShell } from "@/components/layout/CenteredViewportShell";

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [role, setRole] = useState<"instructor" | "student">("student");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Get role from localStorage if available
  useEffect(() => {
    const savedRole = localStorage.getItem("selectedRole");
    if (savedRole && (savedRole === "instructor" || savedRole === "student")) {
      setRole(savedRole as "instructor" | "student");
    }
  }, []);

  useEffect(() => {
    if (isLoaded && !user) {
      router.push("/sign-in");
    }
  }, [isLoaded, user, router]);

  const handleRoleSubmit = async () => {
    if (!user) return;

    setIsSubmitting(true);

    try {
      await user.update({
        unsafeMetadata: { role },
      });

      // Clear localStorage after successful role update
      localStorage.removeItem("selectedRole");

      // Check for redirect URL (deep link preservation)
      const params = new URLSearchParams(window.location.search);
      const redirectUrl = params.get("redirect") || localStorage.getItem("onboarding_redirect");
      localStorage.removeItem("onboarding_redirect");

      if (redirectUrl && redirectUrl.startsWith("/")) {
        router.push(redirectUrl);
      } else if (role === "instructor") {
        router.push("/instructor");
      } else {
        router.push("/student");
      }
    } catch {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <CenteredViewportShell
      className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900"
      contentClassName="max-w-md"
    >
      <Card className="w-full shadow-xl border-0">
        <CardHeader className="text-center pb-6">
          <CardTitle className="text-2xl">
            Quest-On에 오신 것을 환영합니다!
          </CardTitle>
          <CardDescription className="text-base">
            시작하려면 역할을 선택해주세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={role}
            onValueChange={(value) =>
              setRole(value as "instructor" | "student")
            }
          >
            <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="instructor" id="instructor" />
              <Label
                htmlFor="instructor"
                className="text-base cursor-pointer flex-1"
              >
                강사 (시험 출제자)
              </Label>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="student" id="student" />
              <Label
                htmlFor="student"
                className="text-base cursor-pointer flex-1"
              >
                학생 (시험 응시자)
              </Label>
            </div>
          </RadioGroup>

          <Button
            onClick={() => setShowConfirm(true)}
            className="w-full h-12 text-lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? "설정 중..." : "계속하기"}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>역할을 확인해주세요</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">
                {role === "instructor" ? "강사 (시험 출제자)" : "학생 (시험 응시자)"}
              </span>
              (으)로 시작합니다. 역할 선택 후에도 프로필 설정에서 변경할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>다시 선택하기</AlertDialogCancel>
            <AlertDialogAction onClick={handleRoleSubmit}>
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CenteredViewportShell>
  );
}
