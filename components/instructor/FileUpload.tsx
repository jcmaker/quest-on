import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

interface FileUploadProps {
  files: File[];
  disabledFiles: Set<number>;
  canAddMoreFiles: boolean;
  isDragOver: boolean;
  totalSize: number;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragAreaClick: () => void;
  onRemoveFile: (index: number) => void;
  getFileIcon: (fileName: string) => string;
}

export function FileUpload({
  files,
  disabledFiles,
  canAddMoreFiles,
  isDragOver,
  totalSize,
  onFileSelect,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragAreaClick,
  onRemoveFile,
  getFileIcon,
}: FileUploadProps) {
  return (
    <>
      <Separator />
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="materials">수업 자료</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                시험 문제 작성을 위한 수업 자료를 업로드하세요. PDF, PPT, 워드,
                이미지 파일을 지원하며, 최대 50MB까지 업로드 가능합니다. AI가 이
                자료를 참고하여 문제를 생성합니다.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="space-y-2">
          <div className="">
            <Input
              id="materials"
              type="file"
              multiple
              accept=".pdf,.ppt,.pptx,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
              onChange={onFileSelect}
              className="hidden"
              disabled={!canAddMoreFiles}
            />
            <div
              className={`text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg transition-all duration-200 ${
                isDragOver
                  ? "border-blue-400 bg-blue-50 text-blue-600"
                  : canAddMoreFiles
                  ? "border-gray-300 cursor-pointer hover:border-gray-400 hover:bg-gray-50"
                  : "border-gray-200 cursor-not-allowed bg-gray-50 text-gray-400"
              }`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={onDragAreaClick}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="text-2xl">{isDragOver ? "📁" : "📎"}</div>
                <div className="text-sm font-medium">
                  {isDragOver
                    ? "파일을 여기에 놓으세요"
                    : "파일을 드래그하거나 클릭하여 선택"}
                </div>
                <div className="text-xs">PDF, PPT, 워드, 이미지 파일</div>
              </div>
            </div>
          </div>
          <span className="text-sm text-muted-foreground">
            PDF, PPT, 워드, 이미지 파일 (최대 50MB, 자동 압축)
            {!canAddMoreFiles && " - 용량 초과로 추가 불가"}
          </span>

          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">업로드된 파일:</Label>
                <span className="text-xs text-muted-foreground">
                  총 용량: {(totalSize / 1024 / 1024).toFixed(1)}MB / 50MB
                </span>
              </div>
              <div className="space-y-1">
                {files.map((file, index) => {
                  const isDisabled = disabledFiles.has(index);
                  return (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-2 rounded-md ${
                        isDisabled
                          ? "bg-red-50 border border-red-200"
                          : "bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getFileIcon(file.name)}</span>
                        <span
                          className={`text-sm font-medium ${
                            isDisabled ? "text-red-600" : ""
                          }`}
                        >
                          {file.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({(file.size / 1024 / 1024).toFixed(1)}MB)
                        </span>
                        {isDisabled && (
                          <span className="text-xs text-red-500 font-medium">
                            (용량 초과로 비활성화)
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onRemoveFile(index)}
                      >
                        ✕
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

