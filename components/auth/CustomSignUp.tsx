"use client";

import { SignUp } from "@clerk/nextjs";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export function CustomSignUp() {
  const [role, setRole] = useState<"instructor" | "student">("student");
  const [showRoleSelection, setShowRoleSelection] = useState(false);

  // Store selected role in localStorage when user proceeds to signup
  const handleContinue = () => {
    localStorage.setItem("selectedRole", role);
    setShowRoleSelection(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {!showRoleSelection ? (
          <Card>
            <CardHeader>
              <CardTitle>Quest-On 회원가입</CardTitle>
              <CardDescription>사용자 유형을 선택해주세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={role}
                onValueChange={(value) =>
                  setRole(value as "instructor" | "student")
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="instructor" id="instructor" />
                  <Label htmlFor="instructor">강사 (시험 출제자)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="student" id="student" />
                  <Label htmlFor="student">학생 (시험 응시자)</Label>
                </div>
              </RadioGroup>
              <Button onClick={handleContinue} className="w-full">
                계속하기
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                선택된 역할:{" "}
                <strong>{role === "instructor" ? "강사" : "학생"}</strong>
              </p>
            </div>
            <SignUp
              appearance={{
                elements: {
                  formButtonPrimary: "hidden",
                  footer: "hidden",
                },
              }}
              afterSignUpUrl="/onboarding"
            />
            <Button
              variant="outline"
              onClick={() => setShowRoleSelection(false)}
              className="w-full"
            >
              역할 다시 선택
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
