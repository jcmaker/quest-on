import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle, Upload, FolderOpen, X } from "lucide-react";

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
  getFileIcon: (fileName: string) => ReactNode;
  existingFiles?: Array<{ url: string; name: string; index: number }>;
  onRemoveExistingFile?: (index: number) => void;
  extractionStatus?: Map<string, "uploading" | "extracting" | "done" | "failed">;
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
  existingFiles = [],
  onRemoveExistingFile,
  extractionStatus,
}: FileUploadProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          수업 자료
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                시험 문제 작성을 위한 수업 자료를 업로드하세요. PPT, PDF, 워드,
                엑셀, 한글, 이미지 파일을 지원하며, 최대 50MB까지 업로드
                가능합니다. AI가 이 자료를 참고하여 문제를 생성합니다.
              </p>
            </TooltipContent>
          </Tooltip>
        </CardTitle>
        <CardDescription>
          PPT, PDF, 워드, 엑셀, CSV, 한글, 이미지 파일 (최대 50MB, 자동 압축)
          {!canAddMoreFiles && " - 용량 초과로 추가 불가"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <Input
              id="materials"
              type="file"
              multiple
              accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.hwp,.hwpx,.jpg,.jpeg,.png,.gif,.webp"
              onChange={onFileSelect}
              className="hidden"
              disabled={!canAddMoreFiles}
            />
            <div
              className={`text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg transition-all duration-200 ${
                isDragOver
                  ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
                  : canAddMoreFiles
                  ? "border-border cursor-pointer hover:border-muted-foreground hover:bg-muted/50"
                  : "border-muted cursor-not-allowed bg-muted/50 text-muted-foreground"
              }`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={onDragAreaClick}
            >
              <div className="flex flex-col items-center gap-2">
                {isDragOver ? (
                  <FolderOpen className="w-8 h-8 text-blue-500" />
                ) : (
                  <Upload className="w-8 h-8 text-muted-foreground" />
                )}
                <div className="text-sm font-medium">
                  {isDragOver
                    ? "파일을 여기에 놓으세요"
                    : "파일을 드래그하거나 클릭하여 선택"}
                </div>
              </div>
            </div>
          </div>

          {(existingFiles.length > 0 || files.length > 0) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">업로드된 파일:</Label>
                <span className="text-xs text-muted-foreground">
                  총 용량: {(totalSize / 1024 / 1024).toFixed(1)}MB / 50MB
                </span>
              </div>
              <div className="space-y-1">
                {/* 기존 파일들 */}
                {existingFiles.map((file) => (
                  <div
                    key={file.index}
                    className="flex items-center justify-between p-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
                  >
                    <div className="flex items-center gap-2">
                      {getFileIcon(file.name)}
                      <span className="text-sm font-medium">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        (기존 파일)
                      </span>
                    </div>
                    {onRemoveExistingFile && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() => onRemoveExistingFile(file.index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {/* 새로 추가된 파일들 */}
                {files.map((file, index) => {
                  const isDisabled = disabledFiles.has(index);
                  return (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-2 rounded-md ${
                        isDisabled
                          ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
                          : "bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {getFileIcon(file.name)}
                        <span
                          className={`text-sm font-medium ${
                            isDisabled ? "text-red-600 dark:text-red-400" : ""
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
                        size="icon"
                        className="size-8"
                        onClick={() => onRemoveFile(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {extractionStatus && extractionStatus.size > 0 && (
            <div className="flex flex-wrap gap-2">
              {Array.from(extractionStatus.entries()).map(([fileName, status]) => (
                <span
                  key={fileName}
                  className={`text-xs px-2 py-1 rounded-full ${
                    status === "uploading"
                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                      : status === "extracting"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : status === "done"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  }`}
                >
                  {status === "uploading" ? "⬆" : status === "extracting" ? "⏳" : status === "done" ? "✓" : "✗"}{" "}
                  {fileName.length > 20 ? fileName.slice(0, 17) + "..." : fileName}
                  {status === "uploading" && " 업로드 중"}
                  {status === "extracting" && " 분석 중"}
                </span>
              ))}
            </div>
          )}
      </CardContent>
    </Card>
  );
}
