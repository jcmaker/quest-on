"use client";

import { useState, useRef, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Send, Loader2, Check, ChevronDown, ChevronUp, Eye } from "lucide-react";
import toast from "react-hot-toast";
import type { ChatMessage } from "@/hooks/useQuestionGeneration";

const PRESETS = [
  { label: "더 어렵게", instruction: "난이도를 높여주세요. 더 복잡한 조건과 깊은 분석을 요구하도록 수정해주세요." },
  { label: "더 쉽게", instruction: "난이도를 낮춰주세요. 조건을 단순화하고 질문을 더 명확하게 만들어주세요." },
  { label: "더 구체적으로", instruction: "질문을 더 구체적이고 명확하게 만들어주세요." },
  { label: "더 길게", instruction: "시나리오를 더 상세하게 만들고 하위 질문을 추가해주세요." },
];

interface QuestionAdjustSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionText: string;
  history: ChatMessage[];
  isAdjusting: boolean;
  onSendInstruction: (instruction: string) => Promise<unknown>;
  onApply: (newText: string) => void;
}

export function QuestionAdjustSheet({
  open,
  onOpenChange,
  questionText,
  history,
  isAdjusting,
  onSendInstruction,
  onApply,
}: QuestionAdjustSheetProps) {
  const [input, setInput] = useState("");
  const [appliedIdx, setAppliedIdx] = useState<number | null>(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setAppliedIdx(null);
      setIsPreviewExpanded(false);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!input.trim() || isAdjusting) return;

    const instruction = input.trim();
    setInput("");
    await onSendInstruction(instruction);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle>AI로 문제 다듬기</SheetTitle>
        </SheetHeader>

        {/* P0-2: Current question preview with expand/collapse toggle */}
        <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
          <button
            type="button"
            onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            현재 문제
            {isPreviewExpanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          <div
            className={`overflow-y-auto text-sm mt-1 transition-all ${
              isPreviewExpanded ? "max-h-96" : "max-h-64"
            }`}
          >
            <RichTextViewer content={questionText} className="prose-sm" />
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              원하는 수정을 한 문장으로 적어주세요.
              <br />
              예: &quot;난이도는 유지하고, 사례를 한국 기업으로 바꿔줘&quot;
            </p>
          )}

          {history.map((msg, idx) => (
            <div
              key={`${msg.role}-${msg.content}-${msg.questionText ?? "no-question-text"}`}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

                {/* P0-1: Show modified question preview in collapsible */}
                {msg.role === "assistant" && msg.questionText && (
                  <div className="mt-2 space-y-2">
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          수정된 문제 미리보기
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-1.5 p-3 rounded-md bg-background/80 border text-sm max-h-64 overflow-y-auto">
                          <RichTextViewer
                            content={msg.questionText}
                            className="prose-sm"
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* P2-4: Fixed variant comparison (was comparing "default" === "default") */}
                    <Button
                      size="sm"
                      variant={appliedIdx === idx ? "secondary" : "default"}
                      className={`gap-1.5 ${appliedIdx === idx ? "bg-green-600 hover:bg-green-600 text-white" : ""}`}
                      disabled={appliedIdx !== null}
                      onClick={() => {
                        onApply(msg.questionText!);
                        setAppliedIdx(idx);
                        toast.success("수정 사항이 적용되었습니다.");
                        setTimeout(() => {
                          handleOpenChange(false);
                        }, 800);
                      }}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {appliedIdx === idx ? "적용 완료!" : "적용하기"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isAdjusting && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Preset buttons */}
        <div className="px-6 py-2 border-t shrink-0 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant="outline"
              disabled={isAdjusting || loadingPreset !== null}
              className="rounded-full text-xs h-7 px-3"
              onClick={async () => {
                setLoadingPreset(preset.label);
                try {
                  const result = await onSendInstruction(preset.instruction) as { questionText?: string; explanation?: string } | null;
                  if (result && typeof result === "object" && "questionText" in result) {
                    toast.success(`"${preset.label}" 수정이 적용되었습니다.`);
                  }
                } catch {
                  toast.error("수정에 실패했습니다.");
                } finally {
                  setLoadingPreset(null);
                }
              }}
            >
              {loadingPreset === preset.label && (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              )}
              {preset.label}
            </Button>
          ))}
        </div>

        {/* Input area */}
        <form
          onSubmit={handleSubmit}
          className="px-6 py-4 border-t shrink-0 flex gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 난이도는 유지하고, 사례를 한국 기업으로 바꿔줘"
            className="min-h-[44px] max-h-32 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                handleSubmit(e);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isAdjusting}
            className="shrink-0 h-[44px] w-[44px]"
          >
            {isAdjusting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
