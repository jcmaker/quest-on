import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QuestionEditor } from "./QuestionEditor";
import type { Question } from "./QuestionEditor";

interface QuestionsListProps {
  questions: Question[];
  onUpdate: (id: string, field: keyof Question, value: string | boolean) => void;
}

export function QuestionsList({
  questions,
  onUpdate,
}: QuestionsListProps) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>문제</CardTitle>
          <CardDescription>시험 문제를 입력하세요</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {questions.length > 0 && (
          <div className="space-y-4">
            {questions.map((question, index) => (
              <div key={question.id} className="relative">
                <QuestionEditor
                  question={question}
                  index={index}
                  onUpdate={onUpdate}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

