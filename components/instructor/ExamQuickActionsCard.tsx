"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import toast from "react-hot-toast";

interface ExamQuickActionsCardProps {
  examCode: string;
}

export function ExamQuickActionsCard({ examCode }: ExamQuickActionsCardProps) {
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(examCode);
      toast.success("시험 코드가 복사되었습니다.", {
        id: "copy-exam-code", // 중복 방지
      });
    } catch (error) {
      console.error("Copy exam code error:", error);
      toast.error("시험 코드를 복사하지 못했습니다.", {
        id: "copy-exam-code-error",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>빠른 작업</CardTitle>
      </CardHeader>
      <CardContent>
        <Button className="w-full" variant="outline" onClick={handleCopyCode}>
          <Copy className="w-4 h-4 mr-2" />
          시험 코드 복사
        </Button>
      </CardContent>
    </Card>
  );
}
