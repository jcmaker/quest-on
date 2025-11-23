import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { QuestionEditor } from "./QuestionEditor";
import type { Question } from "./QuestionEditor";

interface QuestionsListProps {
  questions: Question[];
  onAdd: () => void;
  onUpdate: (id: string, field: keyof Question, value: string | boolean) => void;
  onRemove: (id: string) => void;
}

export function QuestionsList({
  questions,
  onAdd,
  onUpdate,
  onRemove,
}: QuestionsListProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <CardTitle>문제</CardTitle>
              <CardDescription>시험에 문제를 추가하세요</CardDescription>
            </div>
            {questions.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-sm">
                총 {questions.length}개
              </Badge>
            )}
          </div>
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onAdd();
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            문제 추가
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {questions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>아직 추가된 문제가 없습니다.</p>
            <p>&quot;문제 추가&quot;를 클릭하여 시작하세요!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((question, index) => (
              <div key={question.id} className="relative">
                <QuestionEditor
                  question={question}
                  index={index}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

