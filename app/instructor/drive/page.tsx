"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SignedIn, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import {
  Folder,
  FileText,
  Plus,
  ChevronRight,
  Home,
  MoreVertical,
  Edit,
  Trash2,
  FolderPlus,
  Search,
  LayoutGrid,
  List,
  Copy,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import toast from "react-hot-toast";
import { extractErrorMessage, getErrorMessage } from "@/lib/error-messages";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/animate-ui/components/base/alert-dialog";

interface ExamNode {
  id: string;
  instructor_id: string;
  parent_id: string | null;
  kind: "folder" | "exam";
  name: string;
  sort_order: number;
  exam_id: string | null;
  created_at: string;
  updated_at: string;
  student_count?: number;
  exams?: {
    id: string;
    title: string;
    code: string;
    description: string;
    duration: number;
    status: string;
    created_at: string;
    updated_at: string;
  } | null;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

export default function InstructorDrive() {
  const router = useRouter();
  const { isSignedIn, isLoaded, user } = useUser();
  const queryClient = useQueryClient();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [draggedNode, setDraggedNode] = useState<ExamNode | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<ExamNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [nodeToEdit, setNodeToEdit] = useState<ExamNode | null>(null);
  const [editName, setEditName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const userRole = (user?.unsafeMetadata?.role as string) || "student";

  // TanStack Query for folder contents
  const { data: folderContentsData, isLoading: isLoadingContents } = useQuery({
    queryKey: qk.drive.folderContents(currentFolderId, user?.id),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "get_folder_contents",
          data: { folder_id: currentFolderId },
        }),
        signal, // AbortSignal 연결
      });

      if (!response.ok) {
        let errorData: { error?: string; details?: string } = {};
        try {
          const text = await response.text();
          if (text) {
            errorData = JSON.parse(text);
          }
        } catch (parseError) {
          console.error("Failed to parse error response:", parseError);
          errorData = {
            error: `서버 오류 (${response.status}): ${response.statusText}`,
          };
        }
        const errorMessage =
          errorData.error ||
          errorData.details ||
          `폴더 내용을 불러오는데 실패했습니다. (${response.status})`;
        console.error("Failed to load folder contents:", {
          status: response.status,
          statusText: response.statusText,
          errorData: Object.keys(errorData).length > 0 ? errorData : undefined,
        });
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.nodes || [];
    },
    enabled: !!(isLoaded && isSignedIn && userRole === "instructor"),
    staleTime: 1000 * 60 * 1, // 1 minute cache
  });

  // TanStack Query for breadcrumb
  const { data: breadcrumbData } = useQuery({
    queryKey: qk.drive.breadcrumb(currentFolderId || ""),
    queryFn: async ({ signal }) => {
      if (!currentFolderId) {
        return [];
      }
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "get_breadcrumb",
          data: { folder_id: currentFolderId },
        }),
        signal, // AbortSignal 연결
      });

      if (!response.ok) {
        throw new Error("브레드크럼을 불러오는데 실패했습니다.");
      }

      const data = await response.json();
      return data.breadcrumb || [];
    },
    enabled: !!(
      isLoaded &&
      isSignedIn &&
      userRole === "instructor" &&
      currentFolderId
    ),
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  const nodes = folderContentsData || [];
  const breadcrumb = breadcrumbData || [];
  const isLoading = isLoadingContents;

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) {
      return nodes;
    }
    const query = searchQuery.toLowerCase();
    return nodes.filter((node: ExamNode) =>
      node.name.toLowerCase().includes(query)
    );
  }, [nodes, searchQuery]);

  const folderNodes = useMemo(() => {
    const folders = filteredNodes.filter(
      (node: ExamNode) => node.kind === "folder"
    );
    // 최신순으로 정렬 (updated_at 기준 내림차순)
    return folders.sort((a: ExamNode, b: ExamNode) => {
      const dateA = new Date(a.updated_at).getTime();
      const dateB = new Date(b.updated_at).getTime();
      return dateB - dateA; // 최신이 먼저
    });
  }, [filteredNodes]);

  const examNodes = useMemo(() => {
    const exams = filteredNodes.filter(
      (node: ExamNode) => node.kind === "exam"
    );
    // 최신순으로 정렬 (updated_at 기준 내림차순)
    return exams.sort((a: ExamNode, b: ExamNode) => {
      const dateA = new Date(a.updated_at).getTime();
      const dateB = new Date(b.updated_at).getTime();
      return dateB - dateA; // 최신이 먼저
    });
  }, [filteredNodes]);

  const isFiltering = searchQuery.trim().length > 0;
  const hasResults = filteredNodes.length > 0;
  const searchPlaceholder =
    currentFolderId === null ? "드라이브 검색" : "이 폴더에서 검색";

  const formatDate = (dateString: string) => {
    try {
      return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(new Date(dateString));
    } catch {
      return "";
    }
  };

  const getDragHandlers = (node: ExamNode) => ({
    draggable: !isMoving,
    onDragStart: (e: React.DragEvent) => handleDragStart(e, node),
    onDragEnd: handleDragEnd,
    onDragOver: (e: React.DragEvent) => handleDragOver(e, node),
    onDragLeave: handleDragLeave,
    onDrop: (e: React.DragEvent) => handleDrop(e, node),
  });

  const renderNodeActions = (node: ExamNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            handleEditClick(node);
          }}
        >
          <Edit className="w-4 h-4 mr-2" />
          편집하기
        </DropdownMenuItem>
        {node.kind === "exam" && node.exams?.code && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              handleCopyExamCode(node.exams?.code);
            }}
          >
            <Copy className="w-4 h-4 mr-2" />
            코드 복사
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteClick(node);
          }}
          className="text-destructive"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderNodeStatus = (node: ExamNode) => {
    if (node.kind !== "exam" || !node.exams) {
      return null;
    }

    const statusLabel =
      node.exams.status === "active"
        ? "활성"
        : node.exams.status === "draft"
        ? "초안"
        : "완료";

    if (node.exams.status === "draft") {
      // 초안 뱃지는 임시 비활성화
      return null;
    }

    const badgeClasses =
      node.exams.status === "active"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-slate-200 text-slate-700";

    return (
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badgeClasses}`}
      >
        {statusLabel}
      </span>
    );
  };

  const getViewButtonClasses = (mode: "grid" | "list") =>
    [
      "h-8 w-8 rounded-full border border-transparent transition-colors",
      "text-muted-foreground",
      viewMode === mode
        ? "bg-primary text-primary-foreground shadow-sm"
        : "hover:bg-muted/70",
    ].join(" ");

  const renderStudentCount = (node: ExamNode) => {
    if (node.kind !== "exam") {
      return null;
    }
    const studentCount = node.student_count ?? 0;
    return (
      <span className="text-xs text-muted-foreground">
        학생 {studentCount}명
      </span>
    );
  };

  const renderGridNode = (node: ExamNode) => {
    const dragHandlers = getDragHandlers(node);
    const isDragSource = draggedNode?.id === node.id;
    const isDragTarget = dragOverNodeId === node.id && node.kind === "folder";
    const statusBadge = renderNodeStatus(node);
    const isFolder = node.kind === "folder";
    const iconWrapperClasses = isFolder
      ? "from-blue-100 to-blue-50 text-blue-500"
      : "from-slate-100 to-slate-50 text-slate-500";

    return (
      <Card
        key={node.id}
        {...dragHandlers}
        className={`relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm transition-all duration-200 group ${
          isDragSource ? "opacity-50 scale-95 cursor-grabbing" : "cursor-grab"
        } ${isDragTarget ? "ring-2 ring-primary ring-offset-2" : ""} ${
          isMoving ? "pointer-events-none opacity-60" : ""
        } ${node.kind === "exam" && draggedNode ? "cursor-not-allowed" : ""}`}
      >
        <div
          className="flex flex-1 flex-col text-left"
          onClick={() => {
            if (isMoving) return;
            if (isFolder) {
              handleFolderClick(node.id);
            } else if (node.exam_id) {
              router.push(`/instructor/${node.exam_id}`);
            }
          }}
        >
          <div
            className={`flex flex-1 items-center justify-center bg-gradient-to-b ${iconWrapperClasses} p-10`}
          >
            {isFolder ? (
              <Folder
                className={`h-16 w-16 ${isDragSource ? "animate-pulse" : ""}`}
                strokeWidth={1.5}
              />
            ) : (
              <FileText
                className={`h-16 w-16 ${isDragSource ? "animate-pulse" : ""}`}
                strokeWidth={1.5}
              />
            )}
          </div>
          <CardContent className="flex flex-col gap-2 border-t border-border/50 bg-background/80 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-medium text-foreground truncate">
                  {node.name}
                </h3>
                <div className="mt-1 space-y-0.5">
                  <p className="text-xs text-muted-foreground truncate">
                    {isFolder ? (
                      `폴더 · ${formatDate(node.updated_at)}`
                    ) : (
                      <span className="exam-code">
                        {node.exams?.code || ""}
                      </span>
                    )}
                  </p>
                  {!isFolder && (
                    <p className="text-xs text-muted-foreground truncate">
                      생성 {formatDate(node.created_at)}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {!isFolder && (
              <div className="flex items-center justify-between">
                <div>{statusBadge}</div>
                {renderStudentCount(node)}
              </div>
            )}
          </CardContent>
        </div>
        <div
          className="absolute right-2 top-2"
          onClick={(e) => e.stopPropagation()}
        >
          {renderNodeActions(node)}
        </div>
      </Card>
    );
  };

  const renderListNode = (node: ExamNode) => {
    const dragHandlers = getDragHandlers(node);
    const isDragSource = draggedNode?.id === node.id;
    const isDragTarget = dragOverNodeId === node.id && node.kind === "folder";
    const statusBadge = renderNodeStatus(node);

    return (
      <div
        key={node.id}
        {...dragHandlers}
        className={`group flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-4 py-3 transition ${
          isDragSource ? "opacity-50 cursor-grabbing" : "cursor-grab"
        } ${isDragTarget ? "ring-2 ring-primary bg-primary/5" : ""} ${
          isMoving ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <div
          className="flex items-center gap-4 flex-1"
          onClick={() => {
            if (isMoving) return;
            if (node.kind === "folder") {
              handleFolderClick(node.id);
            } else if (node.exam_id) {
              router.push(`/instructor/${node.exam_id}`);
            }
          }}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background/80">
            {node.kind === "folder" ? (
              <Folder
                className={`w-5 h-5 text-primary ${
                  isDragSource ? "animate-pulse" : ""
                }`}
              />
            ) : (
              <FileText
                className={`w-5 h-5 text-blue-500 ${
                  isDragSource ? "animate-pulse" : ""
                }`}
              />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm text-foreground truncate">
              {node.name}
            </p>
            {node.kind === "folder" ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{formatDate(node.updated_at)}</span>
                <span>· 폴더</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {node.exams?.code && (
                  <span className="exam-code">{node.exams.code}</span>
                )}
                <span>· 생성 {formatDate(node.created_at)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {statusBadge && (
            <span className="hidden sm:inline-flex">{statusBadge}</span>
          )}
          {renderStudentCount(node)}
          {renderNodeActions(node)}
        </div>
      </div>
    );
  };

  const renderSection = (
    title: string,
    nodesList: ExamNode[],
    options: { emptyLabel: string; emptyFilteredLabel: string }
  ) => {
    const emptyMessage = isFiltering
      ? options.emptyFilteredLabel
      : options.emptyLabel;

    const content =
      nodesList.length > 0 ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {nodesList.map((node) => renderGridNode(node))}
          </div>
        ) : (
          <div className="space-y-2">{nodesList.map(renderListNode)}</div>
        )
      ) : (
        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-card/40 py-6 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      );

    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <span className="text-xs text-muted-foreground">
            {nodesList.length}개
          </span>
        </div>
        {content}
      </div>
    );
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error("폴더 이름을 입력해주세요.");
      return;
    }

    try {
      setIsCreatingFolder(true);
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create_folder",
          data: {
            name: newFolderName.trim(),
            parent_id: currentFolderId,
          },
        }),
      });

      if (response.ok) {
        toast.success("폴더가 생성되었습니다.");
        setNewFolderName("");
        setIsCreateFolderOpen(false);
        // Invalidate folder contents query
        queryClient.invalidateQueries({
          queryKey: qk.drive.folderContents(currentFolderId, user?.id),
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = extractErrorMessage(
          errorData,
          "폴더 생성에 실패했습니다",
          response.status
        );
        toast.error(errorMessage, {
          duration: 5000, // 에러 메시지가 길 수 있으므로 더 길게 표시
        });
      }
    } catch (error) {
      console.error("Error creating folder:", error);
      const errorMessage = getErrorMessage(error, "폴더 생성에 실패했습니다");
      toast.error(errorMessage, {
        duration: 5000,
      });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleEditClick = (node: ExamNode) => {
    if (node.kind === "exam") {
      // 시험인 경우 편집 페이지로 이동
      if (node.exam_id) {
        router.push(`/instructor/${node.exam_id}/edit`);
      }
    } else {
      // 폴더인 경우 이름 편집 다이얼로그 열기
      setNodeToEdit(node);
      setEditName(node.name);
      setIsEditDialogOpen(true);
    }
  };

  const handleUpdateNode = async () => {
    if (!nodeToEdit || !editName.trim()) {
      toast.error("이름을 입력해주세요.");
      return;
    }

    if (editName.trim() === nodeToEdit.name) {
      setIsEditDialogOpen(false);
      return;
    }

    try {
      setIsUpdating(true);
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_node",
          data: {
            node_id: nodeToEdit.id,
            name: editName.trim(),
          },
        }),
      });

      if (response.ok) {
        toast.success("이름이 변경되었습니다.");
        setIsEditDialogOpen(false);
        setNodeToEdit(null);
        setEditName("");
        // Invalidate folder contents query
        queryClient.invalidateQueries({
          queryKey: qk.drive.folderContents(currentFolderId, user?.id),
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = extractErrorMessage(
          errorData,
          "이름 변경에 실패했습니다",
          response.status
        );
        toast.error(errorMessage, {
          duration: 5000,
        });
      }
    } catch (error) {
      console.error("Error updating node:", error);
      const errorMessage = getErrorMessage(error, "이름 변경에 실패했습니다");
      toast.error(errorMessage, {
        duration: 5000,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteClick = (node: ExamNode) => {
    if (node.kind === "exam" && node.exams?.code) {
      // 시험인 경우는 여전히 prompt 사용 (시험 코드 입력 필요)
      const input = prompt(
        `"${node.name}" 시험을 삭제하려면 시험 코드를 입력하세요.`
      );
      if (input === null) {
        return;
      }
      if (input.trim() !== node.exams.code) {
        toast.error("시험 코드가 일치하지 않습니다.");
        return;
      }
      // 시험 코드가 맞으면 바로 삭제
      handleDeleteNode(node);
    } else {
      // 폴더인 경우 AlertDialog 사용
      setNodeToDelete(node);
      setDeleteDialogOpen(true);
    }
  };

  const handleDeleteNode = async (node: ExamNode) => {
    try {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "delete_node",
          data: { node_id: node.id },
        }),
      });

      if (response.ok) {
        toast.success("삭제되었습니다.");
        // Invalidate folder contents query
        queryClient.invalidateQueries({
          queryKey: qk.drive.folderContents(currentFolderId, user?.id),
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = extractErrorMessage(
          errorData,
          "삭제에 실패했습니다",
          response.status
        );
        toast.error(errorMessage, {
          duration: 5000, // 에러 메시지가 길 수 있으므로 더 길게 표시
        });
      }
    } catch (error) {
      console.error("Error deleting node:", error);
      const errorMessage = getErrorMessage(error, "삭제에 실패했습니다");
      toast.error(errorMessage, {
        duration: 5000,
      });
    }
  };

  const handleFolderClick = (folderId: string) => {
    setCurrentFolderId(folderId);
  };

  const handleBreadcrumbClick = (folderId: string | null) => {
    setCurrentFolderId(folderId);
  };

  const handleCopyExamCode = async (code?: string) => {
    if (!code) {
      toast.error("시험 코드가 없습니다.");
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      toast.success("시험 코드가 복사되었습니다.", {
        id: "copy-exam-code", // 중복 방지
      });
    } catch (error) {
      console.error("Copy exam code error:", error);
      toast.error("시험 코드를 복사하지 못했습니다.", {
        id: "copy-exam-code-error",
      });
    }
  };

  const handleDragStart = (e: React.DragEvent, node: ExamNode) => {
    setDraggedNode(node);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.id);
    // 드래그 이미지 설정 (선택사항)
    if (e.dataTransfer.setDragImage) {
      const dragImage = document.createElement("div");
      dragImage.innerHTML = node.name;
      dragImage.style.position = "absolute";
      dragImage.style.top = "-1000px";
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    }
  };

  const handleDragEnd = () => {
    setDraggedNode(null);
    setDragOverNodeId(null);
  };

  const handleDragOver = (e: React.DragEvent, node: ExamNode) => {
    // 폴더만 드롭 가능
    if (node.kind !== "folder") {
      return;
    }

    // 자기 자신이나 같은 위치로는 드롭 불가
    if (
      !draggedNode ||
      draggedNode.id === node.id ||
      draggedNode.parent_id === node.id
    ) {
      return;
    }

    // 순환 참조 방지: 드래그한 노드가 폴더이고, 드롭 대상이 그 하위 폴더인지 확인
    // (간단한 구현: 같은 레벨이거나 상위 레벨만 허용)
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverNodeId(node.id);
  };

  const handleDragLeave = () => {
    setDragOverNodeId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetNode: ExamNode) => {
    e.preventDefault();
    setDragOverNodeId(null);

    // 폴더만 드롭 가능
    if (targetNode.kind !== "folder") {
      return;
    }

    // 자기 자신이나 같은 위치로는 드롭 불가
    if (
      !draggedNode ||
      draggedNode.id === targetNode.id ||
      draggedNode.parent_id === targetNode.id
    ) {
      return;
    }

    // 순환 참조 방지: 드래그한 노드가 폴더인 경우, 타겟이 그 하위 폴더가 아닌지 확인
    if (draggedNode.kind === "folder") {
      // 간단한 체크: 타겟의 parent_id가 드래그한 노드의 id와 같으면 순환 참조
      if (targetNode.parent_id === draggedNode.id) {
        toast.error("자기 자신의 하위 폴더로는 이동할 수 없습니다.");
        return;
      }
    }

    try {
      setIsMoving(true);
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "move_node",
          data: {
            node_id: draggedNode.id,
            new_parent_id: targetNode.id,
          },
        }),
      });

      if (response.ok) {
        toast.success(
          `"${draggedNode.name}"이(가) "${targetNode.name}" 폴더로 이동되었습니다.`
        );
        // Invalidate folder contents query
        queryClient.invalidateQueries({
          queryKey: qk.drive.folderContents(currentFolderId, user?.id),
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = extractErrorMessage(
          errorData,
          "이동에 실패했습니다",
          response.status
        );
        toast.error(errorMessage, {
          duration: 5000, // 에러 메시지가 길 수 있으므로 더 길게 표시
        });
      }
    } catch (error) {
      console.error("Error moving node:", error);
      const errorMessage = getErrorMessage(error, "이동에 실패했습니다");
      toast.error(errorMessage, {
        duration: 5000,
      });
    } finally {
      setIsMoving(false);
      setDraggedNode(null);
    }
  };

  // 루트 영역에 드롭 가능하도록
  const handleRootDragOver = (e: React.DragEvent) => {
    if (!draggedNode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedNode) return;

    // 이미 루트에 있으면 무시
    if (draggedNode.parent_id === null) {
      return;
    }

    try {
      setIsMoving(true);
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "move_node",
          data: {
            node_id: draggedNode.id,
            new_parent_id: null,
          },
        }),
      });

      if (response.ok) {
        toast.success(`"${draggedNode.name}"이(가) 루트로 이동되었습니다.`);
        // Invalidate folder contents query
        queryClient.invalidateQueries({
          queryKey: qk.drive.folderContents(currentFolderId, user?.id),
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = extractErrorMessage(
          errorData,
          "이동에 실패했습니다",
          response.status
        );
        toast.error(errorMessage, {
          duration: 5000, // 에러 메시지가 길 수 있으므로 더 길게 표시
        });
      }
    } catch (error) {
      console.error("Error moving node:", error);
      const errorMessage = getErrorMessage(error, "이동에 실패했습니다");
      toast.error(errorMessage, {
        duration: 5000,
      });
    } finally {
      setIsMoving(false);
      setDraggedNode(null);
    }
  };

  const rootDragProps = {
    onDragOver: handleRootDragOver,
    onDrop: handleRootDrop,
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (userRole !== "instructor") {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">강사 권한이 필요합니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <SignedIn>
        <div className="min-h-screen bg-background">
          {/* Header */}
          <header className="bg-card/80 backdrop-blur-sm border-b border-border shadow-sm">
            <div className="max-w-7xl mx-auto px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                    <Folder className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-foreground">
                      내 드라이브
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      시험과 폴더를 관리하세요
                    </p>
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  폴더를 만들어 시험을 정리하고, 드래그 앤 드롭으로 빠르게
                  이동하세요.
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center space-x-2 text-sm">
              <button
                onClick={() => handleBreadcrumbClick(null)}
                className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <Home className="w-4 h-4 mr-1" />
                루트
              </button>
              {breadcrumb.map((item: BreadcrumbItem) => (
                <div key={item.id} className="flex items-center space-x-2">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  <button
                    onClick={() => handleBreadcrumbClick(item.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {item.name}
                  </button>
                </div>
              ))}
            </div>

            <section className="space-y-4">
              <div className="bg-card/80 border border-border rounded-2xl p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button className="gap-2 bg-primary text-primary-foreground">
                          <Plus className="w-4 h-4" />새 항목
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuItem
                          onSelect={() => setIsCreateFolderOpen(true)}
                        >
                          <FolderPlus className="w-4 h-4 mr-2" />새 폴더
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => router.push("/instructor/new")}
                        >
                          <FileText className="w-4 h-4 mr-2" />새 시험
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Link href="/instructor/exams">
                      <Button variant="outline" className="gap-2">
                        <FileText className="w-4 h-4" />
                        시험 관리
                      </Button>
                    </Link>
                  </div>
                  <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[260px]">
                    <div className="relative flex-1 min-w-[220px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="pl-9"
                      />
                    </div>
                    <div className="flex items-center gap-1 rounded-full border border-border bg-background/90 p-1 shadow-sm">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={getViewButtonClasses("grid")}
                        onClick={() => setViewMode("grid")}
                        aria-pressed={viewMode === "grid"}
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={getViewButtonClasses("list")}
                        onClick={() => setViewMode("list")}
                        aria-pressed={viewMode === "list"}
                      >
                        <List className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent"></div>
                </div>
              ) : !hasResults ? (
                <div className="text-center py-16 border-2 border-dashed border-muted-foreground/20 rounded-2xl bg-card/40">
                  <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-2">
                    {isFiltering
                      ? "검색 결과가 없습니다."
                      : "이 폴더가 비어있습니다."}
                  </p>
                  <p className="text-sm text-muted-foreground mb-6">
                    {isFiltering
                      ? "다른 검색어를 시도해보세요."
                      : "새 폴더를 만들거나 시험을 생성해보세요."}
                  </p>
                  {!isFiltering && (
                    <div className="flex items-center justify-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsCreateFolderOpen(true)}
                      >
                        <FolderPlus className="w-4 h-4 mr-2" />
                        폴더 만들기
                      </Button>
                      <Link href="/instructor/new">
                        <Button size="sm">
                          <Plus className="w-4 h-4 mr-2" />
                          시험 만들기
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-10" {...rootDragProps}>
                  {renderSection("폴더", folderNodes, {
                    emptyLabel: "이 폴더에는 아직 하위 폴더가 없습니다.",
                    emptyFilteredLabel: "검색 조건에 맞는 폴더가 없습니다.",
                  })}
                  {renderSection("시험", examNodes, {
                    emptyLabel: "이 폴더에 있는 시험이 없습니다.",
                    emptyFilteredLabel: "검색 조건에 맞는 시험이 없습니다.",
                  })}
                </div>
              )}
            </section>
          </main>

          <Dialog
            open={isCreateFolderOpen}
            onOpenChange={setIsCreateFolderOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>새 폴더 만들기</DialogTitle>
                <DialogDescription>폴더 이름을 입력해주세요.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="folder-name">폴더 이름</Label>
                  <Input
                    id="folder-name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="예: 2025-1학기"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateFolder();
                      }
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateFolderOpen(false)}
                >
                  취소
                </Button>
                <Button
                  onClick={handleCreateFolder}
                  disabled={isCreatingFolder || !newFolderName.trim()}
                >
                  {isCreatingFolder ? "생성 중..." : "생성"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 편집 다이얼로그 */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>이름 편집</DialogTitle>
                <DialogDescription>
                  {nodeToEdit?.kind === "folder"
                    ? "폴더 이름을 수정해주세요."
                    : "이름을 수정해주세요."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">
                    {nodeToEdit?.kind === "folder" ? "폴더 이름" : "이름"}
                  </Label>
                  <Input
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={
                      nodeToEdit?.kind === "folder"
                        ? "예: 2025-1학기"
                        : "이름을 입력하세요"
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleUpdateNode();
                      }
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setNodeToEdit(null);
                    setEditName("");
                  }}
                >
                  취소
                </Button>
                <Button
                  onClick={handleUpdateNode}
                  disabled={isUpdating || !editName.trim()}
                >
                  {isUpdating ? "저장 중..." : "저장"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </SignedIn>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              {nodeToDelete
                ? `"${nodeToDelete.name}"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (nodeToDelete) {
                  handleDeleteNode(nodeToDelete);
                  setDeleteDialogOpen(false);
                  setNodeToDelete(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
