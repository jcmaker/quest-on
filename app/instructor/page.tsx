"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useCallback, memo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
// 동적 임포트로 아이콘 최적화
import { GraduationCap } from "lucide-react";
import dynamic from "next/dynamic";
import { UserMenu } from "@/components/auth/UserMenu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import toast from "react-hot-toast";
import { extractErrorMessage, getErrorMessage } from "@/lib/error-messages";
import { SidebarFooter } from "@/components/dashboard/SidebarFooter";
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
import {
  Sidebar,
  SidebarContent as ShadcnSidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

// 무거운 컴포넌트는 동적 임포트로 지연 로딩
const BookOpen = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.BookOpen }))
);
const Plus = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.Plus }))
);
const FileText = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.FileText }))
);
const Calendar = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.Calendar }))
);
const Loader2 = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.Loader2 }))
);
const Menu = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.Menu }))
);
const LayoutDashboard = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.LayoutDashboard }))
);
const FolderOpen = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.FolderOpen }))
);
const List = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.List }))
);
const Folder = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.Folder }))
);
const Search = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.Search }))
);
const LayoutGrid = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.LayoutGrid }))
);
const MoreVertical = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.MoreVertical }))
);
const Copy = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.Copy }))
);
const Trash2 = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.Trash2 }))
);
const FolderPlus = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.FolderPlus }))
);
const Edit = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.Edit }))
);
const Home = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.Home }))
);
const ChevronRight = dynamic(() =>
  import("lucide-react").then((mod) => ({ default: mod.ChevronRight }))
);

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

export default function InstructorHome() {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn, isLoaded, user } = useUser();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  // Get user role from metadata
  const userRole = (user?.unsafeMetadata?.role as string) || "student";

  // TanStack Query로 폴더 내용 가져오기 (캐싱 및 최적화)
  const { data: nodes = [], isLoading } = useQuery({
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
        signal, // AbortSignal로 취소 가능
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
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.nodes || [];
    },
    enabled: !!(isLoaded && isSignedIn && userRole === "instructor"),
    staleTime: 1000 * 60 * 1, // 1분 캐시
    gcTime: 1000 * 60 * 5, // 5분 후 가비지 컬렉션
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
    enabled: !!(
      isLoaded &&
      isSignedIn &&
      userRole === "instructor" &&
      currentFolderId
    ),
    staleTime: 1000 * 60 * 5, // 5분 캐시
  });

  const breadcrumb = breadcrumbData || [];

  // Scroll to top on mount (한 번만 실행)
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, []); // 빈 의존성 배열로 마운트 시 한 번만 실행

  // Redirect non-instructors or users without role
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      // Role이 설정되지 않은 경우 onboarding으로 리다이렉트
      if (!user?.unsafeMetadata?.role) {
        router.push("/onboarding");
        return;
      }
      // Role이 instructor가 아닌 경우 student 페이지로 리다이렉트
      if (userRole !== "instructor") {
        router.push("/student");
      }
    }
  }, [isLoaded, isSignedIn, userRole, user, router]);

  const filteredNodes = useMemo<ExamNode[]>(() => {
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
    return folders.sort((a: ExamNode, b: ExamNode) => {
      const dateA = new Date(a.updated_at).getTime();
      const dateB = new Date(b.updated_at).getTime();
      return dateB - dateA;
    });
  }, [filteredNodes]);

  const examNodes = useMemo(() => {
    const exams = filteredNodes.filter(
      (node: ExamNode) => node.kind === "exam"
    );
    return exams.sort((a: ExamNode, b: ExamNode) => {
      const dateA = new Date(a.updated_at).getTime();
      const dateB = new Date(b.updated_at).getTime();
      return dateB - dateA;
    });
  }, [filteredNodes]);

  const isFiltering = searchQuery.trim().length > 0;
  const hasResults = filteredNodes.length > 0;

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
      console.error("Copy exam code error:", error);
      toast.error("시험 코드를 복사하지 못했습니다.", {
        id: "copy-exam-code-error",
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
      console.error("Error deleting node:", error);
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
      console.error("Error updating node:", error);
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
          className="opacity-0 group-hover:opacity-100 transition-opacity min-h-[44px] min-w-[44px]"
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
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              handleCopyExamCode(node.exams?.code);
            }}
          >
            <Copy className="w-4 h-4 mr-2" aria-hidden="true" />
            코드 복사
          </DropdownMenuItem>
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
      "h-8 w-8 rounded-full border border-transparent transition-colors text-muted-foreground min-h-[44px] min-w-[44px]",
      viewMode === mode
        ? "bg-primary text-primary-foreground shadow-sm"
        : "hover:bg-muted/70"
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
      console.error("Error creating folder:", error);
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

  const getDragHandlers = (node: ExamNode) => ({
    draggable: !isMoving,
    onDragStart: (e: React.DragEvent) => handleDragStart(e, node),
    onDragEnd: handleDragEnd,
    onDragOver: (e: React.DragEvent) => handleDragOver(e, node),
    onDragLeave: handleDragLeave,
    onDrop: (e: React.DragEvent) => handleDrop(e, node),
  });

  const renderGridNode = useCallback(
    (node: ExamNode) => {
      const isFolder = node.kind === "folder";
      const iconWrapperClasses = isFolder
        ? "from-blue-100 to-blue-50 text-blue-500"
        : "from-slate-100 to-slate-50 text-slate-500";
      const dragHandlers = getDragHandlers(node);
      const isDragSource = draggedNode?.id === node.id;
      const isDragTarget = dragOverNodeId === node.id && node.kind === "folder";

      return (
        <Card
          key={node.id}
          {...dragHandlers}
          className={`relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm transition-all duration-200 group ${
            isDragSource ? "opacity-50 scale-95 cursor-grabbing" : "cursor-grab"
          } ${isDragTarget ? "ring-2 ring-primary ring-offset-2" : ""} ${
            isMoving ? "pointer-events-none opacity-60" : ""
          } ${
            node.kind === "exam" && draggedNode
              ? "cursor-not-allowed"
              : "hover:shadow-md"
          }`}
          onClick={() => {
            if (isMoving) return;
            handleNodeClick(node);
          }}
        >
          <div className="flex flex-1 flex-col text-left">
            <div
              className={`flex flex-1 items-center justify-center bg-gradient-to-b ${iconWrapperClasses} p-10`}
            >
              {isFolder ? (
                <Folder className="h-16 w-16" strokeWidth={1.5} />
              ) : (
                <FileText className="h-16 w-16" strokeWidth={1.5} />
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
                        <span>{node.exams?.code || ""}</span>
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
                  <div>{renderNodeStatus(node)}</div>
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
    },
    [
      formatDate,
      handleNodeClick,
      renderNodeActions,
      renderNodeStatus,
      renderStudentCount,
    ]
  );

  const renderListNode = useCallback(
    (node: ExamNode) => {
      const statusBadge = renderNodeStatus(node);
      const dragHandlers = getDragHandlers(node);
      const isDragSource = draggedNode?.id === node.id;
      const isDragTarget = dragOverNodeId === node.id && node.kind === "folder";

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
        >
          <div className="flex items-center gap-4 flex-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background/80">
              {node.kind === "folder" ? (
                <Folder className="w-5 h-5 text-primary" />
              ) : (
                <FileText className="w-5 h-5 text-blue-500" />
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
                  {node.exams?.code && <span>{node.exams.code}</span>}
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
    },
    [
      formatDate,
      handleNodeClick,
      renderNodeActions,
      renderNodeStatus,
      renderStudentCount,
      getDragHandlers,
      draggedNode,
      dragOverNodeId,
      isMoving,
    ]
  );

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

  const navigationItems = [
    {
      title: "대시보드",
      href: "/instructor",
      icon: LayoutDashboard,
      active: pathname === "/instructor",
    },
    {
      title: "새 시험 생성",
      href: "/instructor/new",
      icon: Plus,
      active: pathname === "/instructor/new",
    },
    {
      title: "내 드라이브",
      href: "/instructor/drive",
      icon: FolderOpen,
      active: pathname === "/instructor/drive",
    },
    {
      title: "시험 관리",
      href: "/instructor/exams",
      icon: List,
      active: pathname === "/instructor/exams",
    },
  ];

  const SidebarContent = () => {
    const { state } = useSidebar();
    const isCollapsed = state === "collapsed";

    return (
      <>
        <SidebarHeader className="p-4 sm:p-5 border-b border-sidebar-border">
          <Link
            href="/instructor"
            className={cn(
              "flex items-center",
              isCollapsed ? "justify-center" : "justify-start"
            )}
          >
            <Image
              src="/qstn_logo_svg.svg"
              alt="Quest-On Logo"
              width={40}
              height={40}
              className="w-10 h-10 shrink-0"
              priority
            />
            {!isCollapsed && (
              <span className="text-xl font-bold text-sidebar-foreground ml-2">
                Quest-On
              </span>
            )}
          </Link>
        </SidebarHeader>

        <ShadcnSidebarContent>
          <nav
            className="flex-1 p-3 sm:p-4 space-y-1 overflow-y-auto"
            aria-label="주요 네비게이션"
          >
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-sidebar group-data-[collapsible=icon]:justify-center",
                    item.active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                  aria-current={item.active ? "page" : undefined}
                  title={isCollapsed ? item.title : undefined}
                >
                  <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                  {!isCollapsed && <span>{item.title}</span>}
                </Link>
              );
            })}
          </nav>
        </ShadcnSidebarContent>

        <SidebarFooter />
      </>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <SignedOut>
        <div className="flex items-center justify-center h-screen p-4">
          <Card className="w-full max-w-md shadow-xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="text-center space-y-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
                <GraduationCap
                  className="w-8 h-8 text-primary-foreground"
                  aria-hidden="true"
                />
              </div>
              <CardTitle className="text-xl font-bold">
                로그인이 필요합니다
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                강사 페이지에 접근하려면 로그인해주세요
              </p>
            </CardHeader>
            <CardContent className="text-center pb-8">
              <Button
                onClick={() => router.replace("/sign-in")}
                className="w-full min-h-[44px]"
                aria-label="강사로 로그인"
              >
                강사로 로그인
              </Button>
            </CardContent>
          </Card>
        </div>
      </SignedOut>

      <SignedIn>
        <SidebarProvider
          defaultOpen={true}
          style={
            {
              "--sidebar-width": "16rem",
              "--sidebar-width-icon": "4rem",
            } as React.CSSProperties
          }
        >
          <Sidebar
            side="left"
            variant="sidebar"
            collapsible="icon"
            className="border-r border-sidebar-border"
          >
            <SidebarContent />
          </Sidebar>

          {/* Mobile Sidebar Sheet */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>메뉴</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col h-full bg-sidebar">
                <div className="p-4 sm:p-5 border-b border-sidebar-border">
                  <Link
                    href="/instructor"
                    className="flex items-center justify-center"
                  >
                    <Image
                      src="/qstn_logo_svg.svg"
                      alt="Quest-On Logo"
                      width={40}
                      height={40}
                      className="w-10 h-10"
                      priority
                    />
                    <span className="text-xl font-bold text-sidebar-foreground ml-2">
                      Quest-On
                    </span>
                  </Link>
                </div>
                <nav
                  className="flex-1 p-3 sm:p-4 space-y-1 overflow-y-auto"
                  aria-label="주요 네비게이션"
                >
                  {navigationItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-sidebar",
                          item.active
                            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                        aria-current={item.active ? "page" : undefined}
                      >
                        <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                        <span>{item.title}</span>
                      </Link>
                    );
                  })}
                </nav>
                <SidebarFooter />
              </div>
            </SheetContent>
          </Sheet>

          <SidebarInset>
            {/* Main Content Area */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              {/* Top Header */}
              <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border shadow-sm transition-all duration-200">
                <div className="px-4 sm:px-6 lg:px-8 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                      {/* Mobile Menu Button */}
                      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                        <SheetTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="lg:hidden min-h-[44px] min-w-[44px] p-0"
                            aria-label="메뉴 열기"
                          >
                            <Menu className="w-5 h-5" aria-hidden="true" />
                          </Button>
                        </SheetTrigger>
                      </Sheet>

                      {/* Desktop Sidebar Toggle */}
                      <SidebarTrigger className="hidden lg:flex" />

                      <div className="min-w-0">
                        <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
                          강사 콘솔
                        </h1>
                        <p className="text-xs text-muted-foreground truncate hidden sm:block">
                          환영합니다,{" "}
                          {user?.firstName ||
                            user?.emailAddresses[0]?.emailAddress}
                          님
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                      <Badge
                        variant="outline"
                        className="bg-primary/10 text-primary border-primary/20 text-xs hidden sm:inline-flex"
                        aria-label="강사 모드"
                      >
                        강사 모드
                      </Badge>
                      <div className="lg:hidden">
                        <UserMenu />
                      </div>
                    </div>
                  </div>
                </div>
              </header>

              {/* Main Content */}
              <main className="flex-1 overflow-y-auto bg-background">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
                  {/* Welcome Section */}
                  <Card className="border-0 shadow-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground overflow-hidden">
                    <CardContent className="p-6 sm:p-8">
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-2 flex-1 min-w-0">
                          <h2 className="text-xl sm:text-2xl font-bold">
                            안녕하세요,{" "}
                            {user?.firstName || user?.fullName || ""} 강사님!
                          </h2>
                          <p className="text-sm sm:text-base text-primary-foreground/90 leading-relaxed">
                            AI 기반 인터랙티브 시험을 생성하고 관리하세요
                          </p>
                        </div>
                        <div className="hidden md:block shrink-0">
                          <BookOpen
                            className="w-16 h-16 text-primary-foreground/60"
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 시험 관리 */}
                  <Card className="border-0 shadow-xl">
                    <CardHeader className="space-y-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="flex items-center space-x-2 text-lg sm:text-xl">
                            <BookOpen
                              className="w-5 h-5 text-primary shrink-0"
                              aria-hidden="true"
                            />
                            <span>시험 관리</span>
                          </CardTitle>
                        </div>
                        <div className="flex items-center gap-3 sm:gap-4 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="flex items-center space-x-2 text-xs sm:text-sm text-muted-foreground">
                            <Calendar
                              className="w-4 h-4 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="whitespace-nowrap">
                              총 {nodes.length}개
                            </span>
                          </div>
                          <Link
                            href="/instructor/drive"
                            className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md"
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-[44px] px-4"
                            >
                              드라이브에서 보기
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 sm:space-y-6">
                      {/* 액션 바 */}
                      <div className="bg-card/80 border border-border rounded-2xl p-4 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                          <div className="flex items-center gap-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button className="gap-2 bg-primary text-primary-foreground min-h-[44px]">
                                  <Plus className="w-4 h-4" />새 항목
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="start"
                                className="w-48"
                              >
                                <DropdownMenuItem
                                  onSelect={() => setIsCreateFolderOpen(true)}
                                >
                                  <FolderPlus className="w-4 h-4 mr-2" />새 폴더
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    router.push("/instructor/new")
                                  }
                                >
                                  <FileText className="w-4 h-4 mr-2" />새 시험
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[260px]">
                            <div className="relative flex-1 min-w-[220px]">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="시험 및 폴더 검색"
                                className="pl-9 min-h-[44px]"
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

                      {/* 콘텐츠 */}
                      {isLoading ? (
                        <div className="flex items-center justify-center py-16">
                          <div className="flex flex-col items-center gap-3">
                            <Loader2
                              className="w-10 h-10 animate-spin text-primary"
                              aria-hidden="true"
                            />
                            <p className="text-sm text-muted-foreground">
                              시험 목록을 불러오는 중...
                            </p>
                          </div>
                        </div>
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
                          {renderSection("폴더", folderNodes, {
                            emptyLabel: "폴더가 없습니다.",
                            emptyFilteredLabel:
                              "검색 조건에 맞는 폴더가 없습니다.",
                          })}
                          {renderSection("시험", examNodes, {
                            emptyLabel: "시험이 없습니다.",
                            emptyFilteredLabel:
                              "검색 조건에 맞는 시험이 없습니다.",
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </main>
            </div>
          </SidebarInset>
        </SidebarProvider>
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
    </div>
  );
}
