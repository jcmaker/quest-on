import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

interface Student {
  id: string;
  name: string;
  email: string;
  status: "not-started" | "in-progress" | "completed";
  score?: number;
  submittedAt?: string;
}

interface StudentProgressCardProps {
  students: Student[];
  examId: string;
}

const getStudentStatusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800";
    case "in-progress":
      return "bg-yellow-100 text-yellow-800";
    case "not-started":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export function StudentProgressCard({
  students,
  examId,
}: StudentProgressCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>학생 진행 상황 ({students.length})</CardTitle>
        <CardDescription>학생 참여도와 점수 모니터링</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {students.map((student) => (
            <div key={student.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="font-medium">{student.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {student.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getStudentStatusColor(student.status)}>
                    {student.status === "completed"
                      ? "완료"
                      : student.status === "in-progress"
                      ? "진행 중"
                      : "시작 안함"}
                  </Badge>
                  {student.status === "completed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-blue-600 border-blue-600 hover:bg-blue-50"
                      onClick={() =>
                        (window.location.href = `/instructor/${examId}/grade/${student.id}`)
                      }
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      채점하기
                    </Button>
                  )}
                </div>
              </div>
              {student.score && (
                <div className="flex items-center justify-between text-sm">
                  <span>점수: {student.score}%</span>
                  <span className="text-muted-foreground">
                    제출: {student.submittedAt}
                  </span>
                </div>
              )}
              {student.status === "in-progress" && (
                <div className="text-sm text-muted-foreground">
                  시작한 지: 00시간 17분
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

