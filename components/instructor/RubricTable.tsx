import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, HelpCircle } from "lucide-react";
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
}

export function RubricTable({
  rubric,
  onAdd,
  onUpdate,
  onRemove,
  isPublic = false,
  onPublicChange,
}: RubricTableProps) {
  return (
    <>
      <Separator />
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="rubric">평가 기준</Label>
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
            </div>
            {onPublicChange && (
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
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            AI 답변과 시험 평가에 사용될 평가 기준을 설정하세요
          </p>
        </div>

        {rubric.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-gray-300 rounded-lg bg-gray-50/50">
            <div className="flex flex-col items-center gap-3">
              <div className="text-2xl">📋</div>
              <div>
                <p className="font-medium text-gray-700">
                  아직 추가된 루브릭이 없습니다
                </p>
                <p className="text-sm">
                  아래 + 버튼을 클릭하여 평가 기준을 설정하세요!
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="w-[200px] font-semibold text-gray-700">
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
                  <TableHead className="font-semibold text-gray-700">
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
                  <TableHead className="w-[80px] text-center font-semibold text-gray-700">
                    작업
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rubric.map((item) => (
                  <TableRow
                    key={item.id}
                    className="align-top hover:bg-gray-50/50"
                  >
                    <TableCell className="py-4 align-top">
                      <Textarea
                        value={item.evaluationArea}
                        onChange={(e) =>
                          onUpdate(item.id, "evaluationArea", e.target.value)
                        }
                        placeholder="예: 문제 해결 능력"
                        className="w-full h-16 resize-none border-gray-200 focus:border-blue-500 focus:ring-blue-500"
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
                        className="w-full h-16 resize-none border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </TableCell>
                    <TableCell className="py-4 text-center align-top">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.preventDefault();
                          onRemove(item.id);
                        }}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex justify-center pt-4">
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onAdd();
            }}
            className="flex items-center gap-2 px-4 py-2"
            variant="outline"
          >
            <Plus className="w-4 h-4" />
            평가 기준 추가
          </Button>
        </div>
      </div>
    </>
  );
}
