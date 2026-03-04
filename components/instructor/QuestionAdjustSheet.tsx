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
import { Send, Loader2, Check } from "lucide-react";
import toast from "react-hot-toast";
import type { ChatMessage } from "@/hooks/useQuestionGeneration";

interface QuestionAdjustSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionText: string;
  history: ChatMessage[];
  isAdjusting: boolean;
  onSendInstruction: (instruction: string) => Promise<void>;
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
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setAppliedIdx(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isAdjusting) return;

    const instruction = input.trim();
    setInput("");
    await onSendInstruction(instruction);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle>AI와 문제 수정</SheetTitle>
        </SheetHeader>

        {/* Current question preview */}
        <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            현재 문제
          </p>
          <div className="max-h-32 overflow-y-auto text-sm">
            <RichTextViewer content={questionText} className="prose-sm" />
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              수정 요청을 입력하면 AI가 문제를 조정합니다.
              <br />
              예: &quot;난이도를 올려줘&quot;, &quot;조건을 변경해줘&quot;, &quot;더 구체적으로 만들어줘&quot;
            </p>
          )}

          {history.map((msg, idx) => (
            <div
              key={idx}
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

                {msg.role === "assistant" && msg.questionText && (
                  <Button
                    size="sm"
                    variant={appliedIdx === idx ? "default" : "default"}
                    className={`mt-2 gap-1.5 ${appliedIdx === idx ? "bg-green-600 hover:bg-green-600" : ""}`}
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

        {/* Input area */}
        <form
          onSubmit={handleSubmit}
          className="px-6 py-4 border-t shrink-0 flex gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="수정 요청을 입력하세요..."
            className="min-h-[44px] max-h-32 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
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
