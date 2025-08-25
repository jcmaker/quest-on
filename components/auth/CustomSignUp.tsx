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

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {!showRoleSelection ? (
          <Card>
            <CardHeader>
              <CardTitle>Choose Your Role</CardTitle>
              <CardDescription>
                Select whether you&apos;re an instructor or a student
              </CardDescription>
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
                  <Label htmlFor="instructor">Instructor</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="student" id="student" />
                  <Label htmlFor="student">Student</Label>
                </div>
              </RadioGroup>
              <Button
                onClick={() => setShowRoleSelection(true)}
                className="w-full"
              >
                Continue
              </Button>
            </CardContent>
          </Card>
        ) : (
          <SignUp
            appearance={{
              elements: {
                formButtonPrimary: "hidden",
                footer: "hidden",
              },
            }}
            afterSignUpUrl="/onboarding"
          />
        )}
      </div>
    </div>
  );
}
