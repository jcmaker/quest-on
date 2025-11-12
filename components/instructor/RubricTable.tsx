import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2 } from "lucide-react";

export interface RubricItem {
  id: string;
  evaluationArea: string;
  detailedCriteria: string;
  weight: number;
}

interface RubricTableProps {
  rubric: RubricItem[];
  onAdd: () => void;
  onUpdate: (id: string, field: keyof RubricItem, value: string | number) => void;
  onRemove: (id: string) => void;
}

export function RubricTable({
  rubric,
  onAdd,
  onUpdate,
  onRemove,
}: RubricTableProps) {
  return (
    <>
      <Separator />
      <div className="space-y-4">
        <div>
          <Label htmlFor="rubric">평가 루브릭</Label>
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
                    평가 영역
                  </TableHead>
                  <TableHead className="font-semibold text-gray-700">
                    세부 사항
                  </TableHead>
                  <TableHead className="w-[120px] text-center font-semibold text-gray-700">
                    중요도 비율
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
                    <TableCell className="py-4">
                      <Input
                        value={item.evaluationArea}
                        onChange={(e) =>
                          onUpdate(item.id, "evaluationArea", e.target.value)
                        }
                        placeholder="예: 문제 해결 능력, 창의적 사고 등"
                        className="w-full h-16 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </TableCell>
                    <TableCell className="py-4">
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
                    <TableCell className="py-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={item.weight}
                            onChange={(e) =>
                              onUpdate(item.id, "weight", parseInt(e.target.value))
                            }
                            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <span className="text-sm font-medium min-w-[40px] text-center">
                            {item.weight}%
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 text-center">
                          비율이 자동으로 조정됩니다
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 text-center">
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

