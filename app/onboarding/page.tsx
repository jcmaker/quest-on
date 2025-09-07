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

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [role, setRole] = useState<"instructor" | "student">("student");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

      // Redirect based on role
      if (role === "instructor") {
        router.push("/instructor");
      } else {
        router.push("/student");
      }
    } catch (error) {
      console.error("Error updating role:", error);
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
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <Card className="w-full max-w-md shadow-xl border-0">
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
            onClick={handleRoleSubmit}
            className="w-full h-12 text-lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? "설정 중..." : "계속하기"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
