"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface ExamDetailsCardProps {
  description: string;
  duration: number;
  createdAt: string;
  examCode: string;
}

export function ExamDetailsCard({
  description,
  duration,
  createdAt,
  examCode,
}: ExamDetailsCardProps) {
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(examCode);
      toast.success("시험 코드가 복사되었습니다.");
    } catch (error) {
      console.error("Copy exam code error:", error);
      toast.error("시험 코드를 복사하지 못했습니다.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>시험 정보</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="font-medium">설명</Label>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="font-medium">시간</Label>
            <p className="text-sm text-muted-foreground">{duration}분</p>
          </div>
        </div>
        <div>
          <Label className="font-medium">생성일</Label>
          <p className="text-sm text-muted-foreground">
            {new Date(createdAt).toLocaleDateString()}
          </p>
        </div>
        <div>
          <Label className="font-medium">시험 코드</Label>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground font-mono">
              {examCode}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyCode}
              className="h-8"
            >
              <Copy className="w-3 h-3 mr-1" />
              복사
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

