import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";

interface Question {
  id: string;
  text: string;
  type: string;
}

interface QuestionsListCardProps {
  questions: Question[];
}

export function QuestionsListCard({ questions }: QuestionsListCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>문제 ({questions.length})</CardTitle>
        <CardDescription>시험 문제 검토 및 편집</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {questions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>등록된 문제가 없습니다.</p>
            </div>
          ) : (
            questions.map((question, index) => (
              <div key={question.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">문제 {index + 1}</h4>
                  <Badge variant="outline">
                    {question.type === "essay"
                      ? "서술형"
                      : question.type === "short-answer"
                      ? "단답형"
                      : question.type === "multiple-choice"
                      ? "객관식"
                      : question.type}
                  </Badge>
                </div>
                <RichTextViewer
                  content={question.text}
                  className="text-sm text-muted-foreground"
                />
              </div>
            ))
          )}
        </div>
        {/* <div className="mt-4">
          <Button variant="outline" size="sm">
            문제 추가
          </Button>
        </div> */}
      </CardContent>
    </Card>
  );
}
