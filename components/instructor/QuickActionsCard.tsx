import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, MessageSquare } from "lucide-react";

export function QuickActionsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">빠른 작업</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button variant="outline" size="sm" className="w-full justify-start">
          <FileText className="w-4 h-4 mr-2" />
          답안 PDF 다운로드
        </Button>
        <Button variant="outline" size="sm" className="w-full justify-start">
          <MessageSquare className="w-4 h-4 mr-2" />
          학생에게 메시지
        </Button>
      </CardContent>
    </Card>
  );
}

