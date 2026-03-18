import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { Plus, Trash2, HelpCircle, Settings, Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface RubricItem {
  id: string;
  evaluationArea: string;
  detailedCriteria: string;
}

interface RubricTableProps {
  rubric: RubricItem[];
  onAdd: () => void;
  onUpdate: (id: string, field: keyof RubricItem, value: string) => void;
  onRemove: (id: string) => void;
  isPublic?: boolean;
  onPublicChange?: (isPublic: boolean) => void;
  chatWeight?: number | null;
  onChatWeightChange?: (weight: number | null) => void;
  onAIGenerate?: (params?: { topics?: string; customInstructions?: string }) => void;
  isAIGenerating?: boolean;
  pendingAISuggestions?: RubricItem[];
  onAcceptAISuggestions?: () => void;
  onDismissAISuggestions?: () => void;
}

export function RubricTable({
  rubric,
  onAdd,
  onUpdate,
  onRemove,
  isPublic = false,
  onPublicChange,
  chatWeight,
  onChatWeightChange,
  onAIGenerate,
  isAIGenerating = false,
  pendingAISuggestions,
  onAcceptAISuggestions,
  onDismissAISuggestions,
}: RubricTableProps) {
  const isCustomWeight = chatWeight !== null && chatWeight !== undefined;
  const effectiveWeight = chatWeight ?? 50;

  const [showAIInput, setShowAIInput] = useState(false);
  const [topics, setTopics] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          평가 기준
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                학생 답안을 평가할 때 사용할 기준을 설정하세요. 평가
                영역(예: 문제 해결 능력, 창의적 사고), 세부 사항(구체적인
                평가 기준)을 입력하면 됩니다. AI가 이 루브릭을 참고하여
                문제를 생성하고 답안을 평가합니다.
              </p>
            </TooltipContent>
          </Tooltip>
        </CardTitle>
        <CardDescription>
          AI 답변과 시험 평가에 사용될 평가 기준을 설정하세요
        </CardDescription>
        {onPublicChange && (
          <CardAction>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="rubric-public"
                className="text-sm font-normal cursor-pointer"
              >
                평가 기준 공개
              </Label>
              <Switch
                id="rubric-public"
                checked={isPublic}
                onCheckedChange={onPublicChange}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    공개하면 학생이 시험을 볼 때 문제 아래에 평가
                    기준(루브릭)이 표시됩니다.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">

        {/* 버튼: 테이블 위에 배치 (CaseQuestionGenerator 패턴과 동일) */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onAdd();
            }}
            className="gap-2"
            variant="outline"
          >
            <Plus className="w-4 h-4" />
            평가 기준 추가
          </Button>
          {onAIGenerate && (
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                if (!isAIGenerating) setShowAIInput((prev) => !prev);
              }}
              disabled={isAIGenerating}
              className="gap-2"
            >
              {isAIGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {isAIGenerating ? "생성 중..." : "AI로 생성"}
              {!isAIGenerating && (showAIInput ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
            </Button>
          )}
        </div>

        {showAIInput && !isAIGenerating && (
          <div className="border border-primary/20 rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="space-y-2">
              <Label htmlFor="rubric-topics" className="text-sm font-medium">
                주제 / 키워드
              </Label>
              <Input
                id="rubric-topics"
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                placeholder="예: 주요 개념, 특정 주제, 응용 사례"
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rubric-instructions" className="text-sm font-medium">
                추가 지시사항 <span className="text-muted-foreground font-normal">(선택)</span>
              </Label>
              <Textarea
                id="rubric-instructions"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="예: 한국 기업 사례를 활용해주세요"
                maxLength={2000}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                className="gap-2"
                onClick={(e) => {
                  e.preventDefault();
                  onAIGenerate?.({ topics: topics.trim() || undefined, customInstructions: customInstructions.trim() || undefined });
                  setShowAIInput(false);
                }}
              >
                <Sparkles className="w-4 h-4" />
                생성
              </Button>
            </div>
          </div>
        )}

        {pendingAISuggestions && pendingAISuggestions.length > 0 && (
          <div className="border border-primary/30 bg-primary/5 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              AI가 루브릭 {pendingAISuggestions.length}개를 제안했습니다
            </div>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {pendingAISuggestions.map((item) => (
                <li key={item.id} className="flex gap-2">
                  <span className="font-medium text-foreground shrink-0">{item.evaluationArea}</span>
                  <span className="truncate">— {item.detailedCriteria}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  onDismissAISuggestions?.();
                }}
              >
                무시
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  onAcceptAISuggestions?.();
                }}
              >
                적용
              </Button>
            </div>
          </div>
        )}

        {rubric.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-1">아직 추가된 루브릭이 없습니다</p>
            <p className="text-sm text-muted-foreground">위 버튼을 클릭하여 평가 기준을 설정하세요</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="w-[200px] font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                      평가 영역
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">
                            평가할 영역의 이름을 입력하세요. 예: &quot;문제 해결
                            능력&quot;, &quot;창의적 사고&quot;, &quot;논리적
                            분석&quot; 등
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                      세부 사항
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">
                            해당 평가 영역에 대한 구체적인 평가 기준을
                            입력하세요. 예: &quot;문제를 정확히 파악하고,
                            체계적인 해결 방법을 제시하며, 논리적으로 설명할 수
                            있는가?&quot;
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableHead>
                  <TableHead className="w-[80px] text-center font-semibold text-foreground">
                    작업
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rubric.map((item) => (
                  <TableRow
                    key={item.id}
                    className="align-top hover:bg-muted/50"
                  >
                    <TableCell className="py-4 align-top">
                      <Textarea
                        value={item.evaluationArea}
                        onChange={(e) =>
                          onUpdate(item.id, "evaluationArea", e.target.value)
                        }
                        placeholder="예: 문제 해결 능력"
                        className="w-full h-16 resize-none"
                      />
                    </TableCell>
                    <TableCell className="py-4 align-top">
                      <Textarea
                        value={item.detailedCriteria}
                        onChange={(e) =>
                          onUpdate(item.id, "detailedCriteria", e.target.value)
                        }
                        placeholder="예: 문제를 정확히 파악하고, 체계적인 해결 방법을 제시하며, 논리적으로 설명할 수 있는가?"
                        rows={3}
                        className="w-full h-16 resize-none"
                      />
                    </TableCell>
                    <TableCell className="py-4 text-center align-middle">
                      <div className="flex justify-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.preventDefault();
                            onRemove(item.id);
                          }}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {onChatWeightChange && (
          <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">채점 가중치 설정</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      채팅 단계(AI 대화 과정)와 답안 단계(최종 답안)의 채점
                      비중을 설정하세요
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                checked={isCustomWeight}
                onCheckedChange={(checked) => {
                  onChatWeightChange(checked ? 50 : null);
                }}
              />
            </div>

            {isCustomWeight ? (
              <div className="space-y-3">
                <Slider
                  value={[effectiveWeight]}
                  onValueChange={([value]) =>
                    onChatWeightChange(value)
                  }
                  min={0}
                  max={100}
                  step={10}
                  className="w-full"
                />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    채팅 과정{" "}
                    <span className="font-semibold text-foreground">
                      {effectiveWeight}%
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    최종 답안{" "}
                    <span className="font-semibold text-foreground">
                      {100 - effectiveWeight}%
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                채팅 과정과 최종 답안을 동일 비중(50:50)으로 평가합니다
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
