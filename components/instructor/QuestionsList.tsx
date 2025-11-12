import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { QuestionEditor } from "./QuestionEditor";
import type { Question } from "./QuestionEditor";

interface QuestionsListProps {
  questions: Question[];
  onAdd: () => void;
  onUpdate: (id: string, field: keyof Question, value: string | boolean) => void;
  onRemove: (id: string) => void;
  onGenerateAI: (id: string) => void;
}

export function QuestionsList({
  questions,
  onAdd,
  onUpdate,
  onRemove,
  onGenerateAI,
}: QuestionsListProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>문제</CardTitle>
            <CardDescription>시험에 문제를 추가하세요</CardDescription>
          </div>
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onAdd();
            }}
          >
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
          <div className="space-y-6">
            {questions.map((question, index) => (
              <QuestionEditor
                key={question.id}
                question={question}
                index={index}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onGenerateAI={onGenerateAI}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

