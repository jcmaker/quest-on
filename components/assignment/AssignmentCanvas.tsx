"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect, useCallback } from "react";
import StarterKit from "@tiptap/starter-kit";
import { TextAlign } from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Heading1,
  Heading2,
  FileText,
  Download,
  X,
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface AssignmentCanvasProps {
  content: string;
  onChange: (content: string) => void;
  isSubmitted: boolean;
  onClose: () => void;
  title: string;
}

export function AssignmentCanvas({
  content,
  onChange,
  isSubmitted,
  onClose,
  title,
}: AssignmentCanvasProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !isSubmitted,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "AI와 대화하거나 직접 문서를 작성하세요...",
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "focus:outline-none min-h-[400px] p-4 prose prose-sm dark:prose-invert max-w-none",
      },
    },
  });

  // Sync external content changes (e.g., from AI canvas_update)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isSubmitted);
    }
  }, [isSubmitted, editor]);

  const handleDownloadPdf = async () => {
    const editorEl = document.querySelector(".ProseMirror");
    if (!editorEl) return;
    const canvas = await html2canvas(editorEl as HTMLElement);
    const pdf = new jsPDF("p", "mm", "a4");
    const imgData = canvas.toDataURL("image/png");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${title || "과제"}.pdf`);
  };

  if (!editor) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        에디터 로딩 중...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="border-b bg-background px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">과제 문서</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDownloadPdf}
            className="gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      {!isSubmitted && (
        <div className="border-b bg-muted/50 p-2 flex flex-wrap gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive("bold") ? "bg-muted" : ""}
            title="굵게 (Ctrl+B)"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive("italic") ? "bg-muted" : ""}
            title="기울임 (Ctrl+I)"
          >
            <Italic className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            className={
              editor.isActive("heading", { level: 1 }) ? "bg-muted" : ""
            }
            title="제목 1"
          >
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            className={
              editor.isActive("heading", { level: 2 }) ? "bg-muted" : ""
            }
            title="제목 2"
          >
            <Heading2 className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive("bulletList") ? "bg-muted" : ""}
            title="글머리 기호 목록"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive("orderedList") ? "bg-muted" : ""}
            title="번호 매기기 목록"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            className={editor.isActive({ textAlign: "left" }) ? "bg-muted" : ""}
            title="왼쪽 정렬"
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            className={
              editor.isActive({ textAlign: "center" }) ? "bg-muted" : ""
            }
            title="가운데 정렬"
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            className={
              editor.isActive({ textAlign: "right" }) ? "bg-muted" : ""
            }
            title="오른쪽 정렬"
          >
            <AlignRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto bg-background">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
