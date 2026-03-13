"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useCallback, memo, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
  Plus,
  FileText,
  Loader2,
  Menu,
  LayoutDashboard,
  FolderOpen,
  List,
  Folder,
  Search,
  LayoutGrid,
  MoreVertical,
  Copy,
  Files as FilesIcon,
  Trash2,
  FolderPlus,
  Edit,
  Home,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import toast from "react-hot-toast";
import { extractErrorMessage, getErrorMessage } from "@/lib/error-messages";
import {
  Files,
  FilesHighlight,
  FolderItem,
  FolderHeader,
  FolderTrigger,
  FolderContent,
  FolderHighlight,
  Folder as FilesFolder,
  FolderIcon,
  FolderLabel,
  FileHighlight,
  File as FilesFile,
  FileIcon,
  FileLabel,
} from "@/components/animate-ui/primitives/radix/files";
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
  child_count?: number;
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

export default function InstructorHome() {
  const router = useRouter();
  const { isSignedIn, isLoaded, user } = useUser();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<ExamNode | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [nodeToEdit, setNodeToEdit] = useState<ExamNode | null>(null);
  const [editName, setEditName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<ExamNode | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );


  // TanStack Query로 폴더 내용 가져오기 (무한 스크롤 페이지네이션)
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: qk.drive.folderContents(currentFolderId, user?.id),
    queryFn: async ({ pageParam, signal }: { pageParam: number; signal: AbortSignal }) => {
      const limit = pageParam === 0 ? 12 : 8;
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get_folder_contents",
          data: { folder_id: currentFolderId, examLimit: limit, examOffset: pageParam },
        }),
        signal,
      });

      if (!response.ok) {
        let errorData: { error?: string; details?: string } = {};
        try {
          const text = await response.text();
          if (text) errorData = JSON.parse(text);
        } catch {
          errorData = { error: `서버 오류 (${response.status}): ${response.statusText}` };
        }
        const errorMessage =
          errorData.error ||
          errorData.details ||
          `폴더 내용을 불러오는데 실패했습니다. (${response.status})`;
        throw new Error(errorMessage);
      }

      return response.json() as Promise<{
        folders: ExamNode[];
        exams: ExamNode[];
        hasMoreExams: boolean;
        totalExamCount: number;
      }>;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMoreExams) return undefined;
      return allPages.reduce((sum, p) => sum + p.exams.length, 0);
    },
    initialPageParam: 0,
    enabled: !!(isLoaded && isSignedIn),
    staleTime: 1000 * 60 * 1,
    gcTime: 1000 * 60 * 5,
  });

  // 브레드크럼 쿼리
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
        signal,
      });

      if (!response.ok) {
        throw new Error("브레드크럼을 불러오는데 실패했습니다.");
      }

      const data = await response.json();
      return data.breadcrumb || [];
    },
    enabled: !!(isLoaded && isSignedIn && currentFolderId),
    staleTime: 1000 * 60 * 5, // 5분 캐시
  });

  const breadcrumb = breadcrumbData || [];

  // Scroll to top on mount (한 번만 실행)
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, []); // 빈 의존성 배열로 마운트 시 한 번만 실행

  // Derive flat folder and exam lists from infinite pages
  const allFolderNodes = useMemo<ExamNode[]>(
    () => infiniteData?.pages[0]?.folders ?? [],
    [infiniteData]
  );
  const allExamNodes = useMemo<ExamNode[]>(
    () => infiniteData?.pages.flatMap((p) => p.exams) ?? [],
    [infiniteData]
  );

  const folderNodes = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const folders = query
      ? allFolderNodes.filter((n) => n.name.toLowerCase().includes(query))
      : allFolderNodes;
    return [...folders].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [allFolderNodes, searchQuery]);

  const examNodes = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const exams = query
      ? allExamNodes.filter((n) => n.name.toLowerCase().includes(query))
      : allExamNodes;
    return [...exams].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [allExamNodes, searchQuery]);

  const isFiltering = searchQuery.trim().length > 0;
  const hasResults = folderNodes.length > 0 || examNodes.length > 0;

  // Intersection Observer sentinel for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 삭제 후 데이터 새로고침 (TanStack Query 캐시 무효화)
  const refetchFolderContents = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: qk.drive.folderContents(currentFolderId, user?.id),
    });
  }, [queryClient, currentFolderId, user?.id]);

  // 날짜 포맷터를 한 번만 생성 (성능 최적화)
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    []
  );

  const formatDate = useCallback(
    (dateString: string) => {
      try {
        return dateFormatter.format(new Date(dateString));
      } catch {
        return "";
      }
    },
    [dateFormatter]
  );

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
      toast.error("시험 코드를 복사하지 못했습니다.", {
        id: "copy-exam-code-error",
      });
    }
  };

  const handleCopyExam = async (node: ExamNode) => {
    if (node.kind !== "exam" || !node.exam_id) {
      toast.error("시험을 복사할 수 없습니다.");
      return;
    }

    try {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "copy_exam",
          data: { exam_id: node.exam_id },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error ||
          errorData.details ||
          "시험 복사에 실패했습니다.";
        toast.error(errorMessage, {
          duration: 5000,
        });
        return;
      }

      toast.success("시험이 복사되었습니다.", {
        id: "copy-exam-success",
      });

      // Refresh folder contents
      refetchFolderContents();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "시험 복사에 실패했습니다.";
      toast.error(errorMessage, {
        duration: 5000,
      });
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
        refetchFolderContents(); // TanStack Query 캐시 무효화 및 재조회
      } else {
        const errorData = await response.json().catch(() => ({}));
        // 에러 메시지 추출 (여러 필드 확인)
        const errorMsg =
          errorData.error ||
          errorData.message ||
          errorData.details ||
          `HTTP ${response.status}: ${response.statusText}`;

        // 영어 메시지인 경우 기본 한글 메시지 사용
        const isEnglish =
          errorMsg && /[a-zA-Z]/.test(errorMsg) && !/[가-힣]/.test(errorMsg);
        toast.error(
          isEnglish
            ? `삭제에 실패했습니다. (${errorMsg})`
            : errorMsg || "삭제에 실패했습니다.",
          {
            duration: 5000, // 에러 메시지가 길 수 있으므로 더 길게 표시
          }
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isEnglish =
        /[a-zA-Z]/.test(errorMessage) && !/[가-힣]/.test(errorMessage);
      toast.error(
        isEnglish
          ? `삭제에 실패했습니다. (${errorMessage})`
          : errorMessage || "삭제에 실패했습니다.",
        {
          duration: 5000,
        }
      );
    }
  };

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
      const errorMessage = getErrorMessage(error, "이름 변경에 실패했습니다");
      toast.error(errorMessage, {
        duration: 5000,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const renderNodeActions = (node: ExamNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="opacity-40 group-hover:opacity-100 transition-opacity min-h-[44px] min-w-[44px]"
          onClick={(e) => e.stopPropagation()}
          aria-label="메뉴 열기"
        >
          <MoreVertical className="w-4 h-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            handleEditClick(node);
          }}
        >
          <Edit className="w-4 h-4 mr-2" aria-hidden="true" />
          편집하기
        </DropdownMenuItem>
        {node.kind === "exam" && node.exams?.code && (
          <>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleCopyExamCode(node.exams?.code);
              }}
            >
              <Copy className="w-4 h-4 mr-2" aria-hidden="true" />
              시험 코드
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleCopyExam(node);
              }}
            >
              <FilesIcon className="w-4 h-4 mr-2" aria-hidden="true" />
              복사본
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteClick(node);
          }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
          삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const getViewButtonClasses = (mode: "grid" | "list") =>
    cn(
      "p-1.5 rounded-md transition-colors",
      viewMode === mode
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:text-foreground"
    );

  // 그리드 뷰 스켈레톤 컴포넌트
  const GridCardSkeleton = () => (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Icon area */}
      <div className="flex items-center justify-center py-10 px-6">
        <Skeleton className="h-14 w-14 rounded-lg" />
      </div>
      {/* Info area */}
      <div className="flex flex-col gap-1.5 border-t bg-muted/40 px-4 py-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex items-center justify-between mt-0.5">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      {/* Menu button */}
      <div className="absolute right-2 top-2">
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
    </div>
  );

  // 리스트 뷰 스켈레톤 컴포넌트
  const ListItemSkeleton = () => (
    <div className="group flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-4 py-3">
      <div className="flex items-center gap-4 flex-1">
        <Skeleton className="h-11 w-11 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-48" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-1" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
    </div>
  );

  // 마우스 오버 시 시험 상세 데이터 프리페칭 (체감 네비게이션 속도 개선)
  const handleExamNodeHover = useCallback(
    (node: ExamNode) => {
      if (node.kind !== "folder" && node.exam_id) {
        queryClient.prefetchQuery({
          queryKey: qk.instructor.examDetail(node.exam_id),
          queryFn: async () => {
            const [examRes, sessionsRes] = await Promise.all([
              fetch(`/api/exam/${node.exam_id}`),
              fetch(`/api/exam/${node.exam_id}/sessions`),
            ]);
            if (!examRes.ok) throw new Error("Prefetch failed");
            const exam = await examRes.json();
            const sessions = sessionsRes.ok ? await sessionsRes.json() : { sessions: [] };
            return { exam, sessions };
          },
          staleTime: 5 * 60 * 1000,
        });
      }
    },
    [queryClient]
  );

  // 노드 클릭 핸들러 최적화
  const handleNodeClick = useCallback(
    (node: ExamNode) => {
      if (node.kind === "folder") {
        // 폴더 클릭 시 하위 내용 표시 (부분 렌더링)
        setCurrentFolderId(node.id);
      } else if (node.exam_id) {
        router.push(`/instructor/${node.exam_id}`);
      }
    },
    [router]
  );

  const handleBreadcrumbClick = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
  }, []);

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
          duration: 5000,
        });
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error, "폴더 생성에 실패했습니다");
      toast.error(errorMessage, {
        duration: 5000,
      });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, node: ExamNode) => {
    setDraggedNode(node);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.id);
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
    if (node.kind !== "folder") {
      return;
    }

    if (
      !draggedNode ||
      draggedNode.id === node.id ||
      draggedNode.parent_id === node.id
    ) {
      return;
    }

    if (draggedNode.kind === "folder") {
      if (node.parent_id === draggedNode.id) {
        return;
      }
    }

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

    if (targetNode.kind !== "folder") {
      return;
    }

    if (
      !draggedNode ||
      draggedNode.id === targetNode.id ||
      draggedNode.parent_id === targetNode.id
    ) {
      return;
    }

    if (draggedNode.kind === "folder") {
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
          duration: 5000,
        });
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error, "이동에 실패했습니다");
      toast.error(errorMessage, {
        duration: 5000,
      });
    } finally {
      setIsMoving(false);
      setDraggedNode(null);
    }
  };

  const handleRootDragOver = (e: React.DragEvent) => {
    if (!draggedNode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedNode) return;

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
          duration: 5000,
        });
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error, "이동에 실패했습니다");
      toast.error(errorMessage, {
        duration: 5000,
      });
    } finally {
      setIsMoving(false);
      setDraggedNode(null);
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

  // Folder card: the card itself IS the folder shape (tab + fold + body)
  const renderFolderCard = useCallback(
    (node: ExamNode) => {
      const dragHandlers = getDragHandlers(node);
      const isDragSource = draggedNode?.id === node.id;
      const isDragTarget = dragOverNodeId === node.id;
      const hasFiles = (node.child_count ?? 0) > 0;

      return (
        <div
          key={node.id}
          {...dragHandlers}
          className={cn(
            "folder-card cursor-grab transition-all duration-200 group",
            isDragSource && "opacity-50 scale-95 cursor-grabbing",
            isDragTarget && "ring-2 ring-primary ring-offset-2",
            isMoving && "pointer-events-none opacity-60"
          )}
          onClick={() => {
            if (isMoving) return;
            handleNodeClick(node);
          }}
        >
          <div className="folder-card__tab" aria-hidden />
          <div className="folder-card__fold" aria-hidden />
          {/* Paper peeking out for non-empty folders */}
          {hasFiles && (
            <div className="folder-card__paper" aria-hidden />
          )}
          <div className="folder-card__body relative">
            <div
              className="absolute right-1 top-1 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {renderNodeActions(node)}
            </div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/80">
              폴더
            </p>
            <p className="font-medium text-foreground truncate text-sm mt-0.5">
              {node.name}
            </p>
            <p className="text-xs text-foreground/85 mt-0.5">
              {formatDate(node.updated_at)}
            </p>
          </div>
        </div>
      );
    },
    [
      formatDate,
      handleNodeClick,
      renderNodeActions,
      getDragHandlers,
      draggedNode,
      dragOverNodeId,
      isMoving,
    ]
  );

  const renderGridNode = useCallback(
    (node: ExamNode) => {
      const isFolder = node.kind === "folder";
      const dragHandlers = getDragHandlers(node);
      const isDragSource = draggedNode?.id === node.id;
      const isDragTarget = dragOverNodeId === node.id && node.kind === "folder";

      return (
        <div
          key={node.id}
          {...dragHandlers}
          className={cn(
            "relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200 group",
            isDragSource ? "opacity-50 scale-95 cursor-grabbing" : "cursor-grab",
            isDragTarget && "ring-2 ring-primary ring-offset-2",
            isMoving && "pointer-events-none opacity-60",
            node.kind === "exam" && draggedNode
              ? "cursor-not-allowed"
              : "hover:shadow-md"
          )}
          onClick={() => {
            if (isMoving) return;
            handleNodeClick(node);
          }}
          onMouseEnter={() => handleExamNodeHover(node)}
        >
          {/* Icon area */}
          <div className="relative flex items-center justify-center py-10 px-6">
            {isFolder ? (
              <Folder className="h-14 w-14 text-muted-foreground/60" strokeWidth={1.5} />
            ) : (
              <FileText className="h-14 w-14 text-muted-foreground/60" strokeWidth={1.5} />
            )}
            {/* Three-dot menu */}
            <div
              className="absolute right-2 top-2"
              onClick={(e) => e.stopPropagation()}
            >
              {renderNodeActions(node)}
            </div>
          </div>
          {/* Info area */}
          <div className="flex flex-col gap-1.5 border-t bg-muted/40 px-4 py-3">
            <h3 className="text-sm font-medium text-foreground truncate">
              {node.name}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {isFolder ? (
                <span>폴더 · {formatDate(node.updated_at)}</span>
              ) : (
                <>
                  {node.exams?.code && (
                    <span className="exam-code font-mono">{node.exams.code}</span>
                  )}
                  <span>·</span>
                  <span>{formatDate(node.created_at)}</span>
                </>
              )}
            </div>
            {!isFolder && (
              <div className="flex items-center justify-between mt-0.5">
                <div>{renderNodeStatus(node)}</div>
                {renderStudentCount(node)}
              </div>
            )}
          </div>
        </div>
      );
    },
    [
      formatDate,
      handleNodeClick,
      handleExamNodeHover,
      renderNodeActions,
      renderNodeStatus,
      renderStudentCount,
      getDragHandlers,
      draggedNode,
      dragOverNodeId,
      isMoving,
    ]
  );

  // 재귀적으로 폴더 트리를 렌더링하는 컴포넌트 (리스트뷰용)
  const FolderTreeItem = memo(
    ({
      folder,
      userId,
      onFolderClick,
      onFileClick,
      level = 0,
    }: {
      folder: ExamNode;
      userId?: string;
      onFolderClick: (folderId: string) => void;
      onFileClick: (examId: string) => void;
      level?: number;
    }) => {
      const { data: children = [], isLoading } = useQuery({
        queryKey: qk.drive.folderContents(folder.id, userId),
        queryFn: async ({ signal }) => {
          const response = await fetch("/api/supa", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "get_folder_contents",
              data: { folder_id: folder.id },
            }),
            signal,
          });

          if (!response.ok) {
            throw new Error("Failed to load folder contents");
          }

          const data = await response.json();
          return [...(data.folders || []), ...(data.exams || [])];
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 1,
      });

      const folders = useMemo(
        () => children.filter((node: ExamNode) => node.kind === "folder"),
        [children]
      );
      const files = useMemo(
        () => children.filter((node: ExamNode) => node.kind === "exam"),
        [children]
      );

      return (
        <FolderItem value={folder.id}>
          <FolderHeader>
            <FolderTrigger className="w-full text-start">
              <FolderHighlight>
                <FilesFolder
                  className="flex items-center gap-2 p-2 pointer-events-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFolderClick(folder.id);
                  }}
                >
                  <FolderIcon
                    closeIcon={<Folder className="size-4" />}
                    openIcon={<FolderOpen className="size-4" />}
                  />
                  <FolderLabel className="text-sm">{folder.name}</FolderLabel>
                </FilesFolder>
              </FolderHighlight>
            </FolderTrigger>
          </FolderHeader>
          <div className="relative ml-8 before:absolute before:-left-3 before:top-0 before:bottom-0 before:w-[1px] before:bg-border/50">
            <FolderContent className="pl-2">
              {isLoading ? (
                <div className="py-1 text-xs text-muted-foreground">
                  로딩 중...
                </div>
              ) : (
                <>
                  {level === 0
                    ? // 최상위 레벨: 파일들을 모두 표시
                      files.map((file: ExamNode) => (
                        <FileHighlight key={file.id}>
                          <FilesFile
                            className="flex items-center gap-2 p-2 pointer-events-none cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (file.exam_id) {
                                onFileClick(file.exam_id);
                              }
                            }}
                          >
                            <FileIcon>
                              <FileText className="size-4" />
                            </FileIcon>
                            <FileLabel className="text-sm">
                              {file.name}
                            </FileLabel>
                          </FilesFile>
                        </FileHighlight>
                      ))
                    : // 하위 레벨 (level >= 1): 파일이 있으면 "..." 표시
                      files.length > 0 && (
                        <FileHighlight>
                          <FilesFile className="flex items-center gap-2 p-2 pointer-events-none">
                            <FileIcon>
                              <FileText className="size-4 opacity-50" />
                            </FileIcon>
                            <FileLabel className="text-xs text-muted-foreground">
                              ...
                            </FileLabel>
                          </FilesFile>
                        </FileHighlight>
                      )}
                  {folders.length > 0 && (
                    <Files>
                      {folders.map((childFolder: ExamNode) => (
                        <FolderTreeItem
                          key={childFolder.id}
                          folder={childFolder}
                          userId={userId}
                          onFolderClick={onFolderClick}
                          onFileClick={onFileClick}
                          level={level + 1}
                        />
                      ))}
                    </Files>
                  )}
                </>
              )}
            </FolderContent>
          </div>
        </FolderItem>
      );
    }
  );

  FolderTreeItem.displayName = "FolderTreeItem";

  // 폴더 하위 내용을 가져오는 컴포넌트 (리스트뷰용)
  const FolderChildren = memo(
    ({
      folderId,
      userId,
      onFolderClick,
      onFileClick,
    }: {
      folderId: string;
      userId?: string;
      onFolderClick: (folderId: string) => void;
      onFileClick: (examId: string) => void;
    }) => {
      const { data: children = [], isLoading } = useQuery({
        queryKey: qk.drive.folderContents(folderId, userId),
        queryFn: async ({ signal }) => {
          const response = await fetch("/api/supa", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "get_folder_contents",
              data: { folder_id: folderId },
            }),
            signal,
          });

          if (!response.ok) {
            throw new Error("Failed to load folder contents");
          }

          const data = await response.json();
          return [...(data.folders || []), ...(data.exams || [])];
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 1,
      });

      if (isLoading) {
        return (
          <div className="pl-12 py-2 text-xs text-muted-foreground">
            로딩 중...
          </div>
        );
      }

      if (children.length === 0) {
        return (
          <div className="pl-12 py-2 text-xs text-muted-foreground">
            폴더가 비어있습니다
          </div>
        );
      }

      const folders = children.filter(
        (node: ExamNode) => node.kind === "folder"
      );
      const files = children.filter((node: ExamNode) => node.kind === "exam");

      return (
        <div className="relative ml-8 before:absolute before:-left-3 before:top-0 before:bottom-0 before:w-[1px] before:bg-border/50">
          <FilesHighlight className="bg-accent pointer-events-none">
            <Files className="pl-2">
              {files.map((file: ExamNode) => (
                <FileHighlight key={file.id}>
                  <FilesFile
                    className="flex items-center gap-2 p-2 pointer-events-none cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (file.exam_id) {
                        onFileClick(file.exam_id);
                      }
                    }}
                  >
                    <FileIcon>
                      <FileText className="size-4" />
                    </FileIcon>
                    <FileLabel className="text-sm">{file.name}</FileLabel>
                  </FilesFile>
                </FileHighlight>
              ))}
              {folders.map((folder: ExamNode) => (
                <FolderTreeItem
                  key={folder.id}
                  folder={folder}
                  userId={userId}
                  onFolderClick={onFolderClick}
                  onFileClick={onFileClick}
                  level={0}
                />
              ))}
            </Files>
          </FilesHighlight>
        </div>
      );
    }
  );

  FolderChildren.displayName = "FolderChildren";

  const renderListNode = useCallback(
    (node: ExamNode) => {
      const statusBadge = renderNodeStatus(node);
      const dragHandlers = getDragHandlers(node);
      const isDragSource = draggedNode?.id === node.id;
      const isDragTarget = dragOverNodeId === node.id && node.kind === "folder";
      const isExpanded = expandedFolders.has(node.id);

      if (node.kind === "folder") {
        return (
          <Collapsible
            key={node.id}
            open={isExpanded}
            onOpenChange={(open) => {
              const newExpanded = new Set(expandedFolders);
              if (open) {
                newExpanded.add(node.id);
              } else {
                newExpanded.delete(node.id);
              }
              setExpandedFolders(newExpanded);
            }}
          >
            <div
              {...dragHandlers}
              className={`group flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-4 py-3 transition ${
                isDragSource ? "opacity-50 cursor-grabbing" : "cursor-grab"
              } ${isDragTarget ? "ring-2 ring-primary bg-primary/5" : ""} ${
                isMoving ? "pointer-events-none opacity-60" : ""
              } hover:shadow-sm`}
            >
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-4 flex-1 cursor-pointer">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background/80">
                    <Folder className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-foreground truncate">
                      {node.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(node.updated_at)}</span>
                      <span>· 폴더</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                    {renderNodeActions(node)}
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {isExpanded && (
                  <FolderChildren
                    folderId={node.id}
                    userId={user?.id}
                    onFolderClick={setCurrentFolderId}
                    onFileClick={(examId) =>
                      router.push(`/instructor/${examId}`)
                    }
                  />
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      }

      return (
        <div
          key={node.id}
          {...dragHandlers}
          className={`group flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-4 py-3 transition ${
            isDragSource ? "opacity-50 cursor-grabbing" : "cursor-grab"
          } ${isDragTarget ? "ring-2 ring-primary bg-primary/5" : ""} ${
            isMoving ? "pointer-events-none opacity-60" : ""
          } hover:shadow-sm`}
          onClick={() => {
            if (isMoving) return;
            handleNodeClick(node);
          }}
          onMouseEnter={() => handleExamNodeHover(node)}
        >
          <div className="flex items-center gap-4 flex-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background/80">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm text-foreground truncate">
                {node.name}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {node.exams?.code && <span>{node.exams.code}</span>}
                <span>· 생성 {formatDate(node.created_at)}</span>
              </div>
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
    },
    [
      formatDate,
      handleNodeClick,
      handleExamNodeHover,
      renderNodeActions,
      renderNodeStatus,
      renderStudentCount,
      getDragHandlers,
      draggedNode,
      dragOverNodeId,
      isMoving,
      expandedFolders,
      router,
      user?.id,
    ]
  );

  return (
    <>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
                  {/* Simple greeting */}
                  <p className="text-lg font-medium text-foreground">
                    안녕하세요, {user?.firstName || user?.fullName || "강사"}님
                  </p>

                  {/* 시험 관리 */}
                  <section className="space-y-4">
                    {/* Toolbar: new + search + view toggle — single row */}
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" className="gap-1.5 shrink-0">
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">새 항목</span>
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

                      <div className="relative flex-1 min-w-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="시험 및 폴더 검색"
                          className="pl-9 h-9"
                        />
                      </div>

                      <div className="flex items-center gap-0.5 border rounded-lg p-1 shrink-0">
                        <button
                          type="button"
                          className={getViewButtonClasses("grid")}
                          onClick={() => setViewMode("grid")}
                          aria-pressed={viewMode === "grid"}
                          aria-label="그리드 보기"
                        >
                          <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className={getViewButtonClasses("list")}
                          onClick={() => setViewMode("list")}
                          aria-pressed={viewMode === "list"}
                          aria-label="목록 보기"
                        >
                          <List className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                      {/* 브레드크럼 */}
                      {(currentFolderId || breadcrumb.length > 0) && (
                        <div className="flex items-center space-x-2 text-sm">
                          <button
                            onClick={() => handleBreadcrumbClick(null)}
                            className="flex items-center text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-2"
                          >
                            <Home className="w-4 h-4 mr-1" />
                            루트
                          </button>
                          {breadcrumb.map(
                            (item: { id: string; name: string }) => (
                              <div
                                key={item.id}
                                className="flex items-center space-x-2"
                              >
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                <button
                                  onClick={() => handleBreadcrumbClick(item.id)}
                                  className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-2"
                                >
                                  {item.name}
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {/* 콘텐츠: 폴더 행 + 시험 영역 */}
                      {isLoading ? (
                        <>
                          <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              폴더
                            </p>
                            <div className="overflow-x-auto pb-2">
                              <div className="flex gap-4 min-w-max">
                                {[...Array(4)].map((_, i) => (
                                  <div key={i} className="folder-card opacity-70">
                                    <div className="folder-card__tab" />
                                    <div className="folder-card__fold" />
                                    <div className="folder-card__body">
                                      <Skeleton className="h-3 w-12 bg-white/40" />
                                      <Skeleton className="h-4 w-full mt-1.5 bg-white/40" />
                                      <Skeleton className="h-3 w-16 mt-1 bg-white/40" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              시험
                            </p>
                            {viewMode === "grid" ? (
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {[...Array(4)].map((_, i) => (
                                  <GridCardSkeleton key={i} />
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-2" aria-busy="true" aria-live="polite">
                                {[...Array(4)].map((_, i) => (
                                  <ListItemSkeleton key={i} />
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      ) : !hasResults ? (
                        <div className="text-center py-16 border-2 border-dashed border-muted-foreground/20 rounded-2xl bg-card/40">
                          <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground mb-2">
                            {isFiltering
                              ? "검색 결과가 없습니다."
                              : "아직 시험이나 폴더가 없습니다."}
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
                                className="min-h-[44px]"
                                onClick={() => setIsCreateFolderOpen(true)}
                              >
                                <FolderPlus className="w-4 h-4 mr-2" />
                                폴더 만들기
                              </Button>
                              <Link href="/instructor/new">
                                <Button size="sm" className="min-h-[44px]">
                                  <Plus className="w-4 h-4 mr-2" />
                                  시험 만들기
                                </Button>
                              </Link>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className="space-y-10"
                          onDragOver={handleRootDragOver}
                          onDrop={handleRootDrop}
                        >
                          {/* 폴더: 가로 스크롤 카드 행 */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                폴더
                              </p>
                              <span className="text-xs text-muted-foreground">
                                {folderNodes.length}개
                              </span>
                            </div>
                            {folderNodes.length > 0 ? (
                              <div className="overflow-x-auto pb-2 scrollbar-thin">
                                <div className="flex gap-4 min-w-max">
                                  {folderNodes.map((node) => renderFolderCard(node))}
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-card/40 py-6 text-center text-sm text-muted-foreground">
                                {isFiltering
                                  ? "검색 조건에 맞는 폴더가 없습니다."
                                  : "폴더가 없습니다."}
                              </div>
                            )}
                          </div>

                          {/* 시험: 그리드/리스트 선택 */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                시험
                              </p>
                              <span className="text-xs text-muted-foreground">
                                {examNodes.length}개
                              </span>
                            </div>
                            {examNodes.length > 0 ? (
                              viewMode === "grid" ? (
                                <>
                                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {examNodes.map((node) => renderGridNode(node))}
                                  </div>
                                  <div ref={sentinelRef} />
                                  {isFetchingNextPage && (
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                      {[...Array(4)].map((_, i) => (
                                        <GridCardSkeleton key={i} />
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div className="space-y-2">
                                    {examNodes.map((node) => renderListNode(node))}
                                  </div>
                                  <div ref={sentinelRef} />
                                  {isFetchingNextPage && (
                                    <div className="space-y-2" aria-busy="true" aria-live="polite">
                                      {[...Array(4)].map((_, i) => (
                                        <ListItemSkeleton key={i} />
                                      ))}
                                    </div>
                                  )}
                                </>
                              )
                            ) : (
                              <>
                                <div ref={sentinelRef} />
                                <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-card/40 py-6 text-center text-sm text-muted-foreground">
                                  {isFiltering
                                    ? "검색 조건에 맞는 시험이 없습니다."
                                    : "시험이 없습니다."}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                  </section>
                </div>

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

      {/* 폴더 생성 다이얼로그 */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
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
              onClick={() => {
                setIsCreateFolderOpen(false);
                setNewFolderName("");
              }}
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
    </>
  );
}
