import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Question {
  id: string;
  idx: number;
  type: string;
  prompt: string;
}

interface Grade {
  id: string;
  q_idx: number;
  score: number;
  comment?: string;
}

interface QuestionNavigationProps {
  questions: Question[];
  selectedQuestionIdx: number;
  onSelectQuestion: (idx: number) => void;
  grades: Record<number, Grade>;
}

export function QuestionNavigation({
  questions,
  selectedQuestionIdx,
  onSelectQuestion,
  grades,
}: QuestionNavigationProps) {
  if (!questions || !Array.isArray(questions)) {
    return (
      <div className="mb-6">
        <div className="text-red-600">문제를 불러올 수 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex gap-2 flex-wrap">
        {questions.map((question, idx) => (
          <Button
            key={question.id || idx}
            variant={selectedQuestionIdx === idx ? "default" : "outline"}
            size="sm"
            onClick={() => onSelectQuestion(idx)}
          >
            문제 {idx + 1}
            {grades[idx] && (
              <Badge
                variant="secondary"
                className="ml-2 bg-green-100 text-green-800"
              >
                {grades[idx]?.score || 0}점
              </Badge>
            )}
          </Button>
        ))}
      </div>
    </div>
  );
}

