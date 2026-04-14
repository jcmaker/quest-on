"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface CopyMessageButtonProps {
  text: string;
  className?: string;
}

export function CopyMessageButton({ text, className }: CopyMessageButtonProps) {
  const [copied, setCopied] = useState(false);

  const INTERNAL_COPY_MARKER_START = "\u200B\u{E0001}\u200B";
  const INTERNAL_COPY_MARKER_END = "\u200B\u{E0002}\u200B";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        INTERNAL_COPY_MARKER_START + text + INTERNAL_COPY_MARKER_END
      );
      setCopied(true);
      toast.success("복사되었습니다.", { id: "copy-message" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("복사에 실패했습니다.", { id: "copy-message-error" });
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={handleCopy}
      aria-label="메시지 복사"
      className={cn(
        "opacity-40 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity",
        className
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
