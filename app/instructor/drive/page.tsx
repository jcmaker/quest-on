"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignedIn, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

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
  const [nodes, setNodes] = useState<ExamNode[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [draggedNode, setDraggedNode] = useState<ExamNode | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  const userRole = (user?.unsafeMetadata?.role as string) || "student";

  useEffect(() => {
    if (isLoaded && isSignedIn && userRole === "instructor") {
      loadFolderContents(currentFolderId);
      if (currentFolderId) {
        loadBreadcrumb(currentFolderId);
      } else {
        setBreadcrumb([]);
      }
    }
  }, [isLoaded, isSignedIn, userRole, currentFolderId]);

  const loadFolderContents = async (folderId: string | null) => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "get_folder_contents",
          data: { folder_id: folderId },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNodes(data.nodes || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Failed to load folder contents:", errorData);
        toast.error(
          errorData.error || "폴더 내용을 불러오는데 실패했습니다."
        );
      }
    } catch (error) {
      console.error("Error loading folder contents:", error);
      toast.error("폴더 내용을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadBreadcrumb = async (folderId: string) => {
    try {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "get_breadcrumb",
          data: { folder_id: folderId },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setBreadcrumb(data.breadcrumb || []);
      }
    } catch (error) {
      console.error("Error loading breadcrumb:", error);
    }
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
        loadFolderContents(currentFolderId);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || "폴더 생성에 실패했습니다.");
      }
    } catch (error) {
      console.error("Error creating folder:", error);
      toast.error("폴더 생성에 실패했습니다.");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteNode = async (nodeId: string, nodeName: string) => {
    if (!confirm(`"${nodeName}"을(를) 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "delete_node",
          data: { node_id: nodeId },
        }),
      });

      if (response.ok) {
        toast.success("삭제되었습니다.");
        loadFolderContents(currentFolderId);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || "삭제에 실패했습니다.");
      }
    } catch (error) {
      console.error("Error deleting node:", error);
      toast.error("삭제에 실패했습니다.");
    }
  };

  const handleFolderClick = (folderId: string) => {
    setCurrentFolderId(folderId);
  };

  const handleBreadcrumbClick = (folderId: string | null) => {
    setCurrentFolderId(folderId);
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
    if (!draggedNode || draggedNode.id === node.id || draggedNode.parent_id === node.id) {
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
    if (!draggedNode || draggedNode.id === targetNode.id || draggedNode.parent_id === targetNode.id) {
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
        toast.success(`"${draggedNode.name}"이(가) "${targetNode.name}" 폴더로 이동되었습니다.`);
        loadFolderContents(currentFolderId);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || "이동에 실패했습니다.");
      }
    } catch (error) {
      console.error("Error moving node:", error);
      toast.error("이동에 실패했습니다.");
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
        loadFolderContents(currentFolderId);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || "이동에 실패했습니다.");
      }
    } catch (error) {
      console.error("Error moving node:", error);
      toast.error("이동에 실패했습니다.");
    } finally {
      setIsMoving(false);
      setDraggedNode(null);
    }
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
                  <h1 className="text-2xl font-bold text-foreground">내 드라이브</h1>
                  <p className="text-sm text-muted-foreground">
                    시험과 폴더를 관리하세요
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <FolderPlus className="w-4 h-4 mr-2" />
                      폴더 만들기
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>새 폴더 만들기</DialogTitle>
                      <DialogDescription>
                        폴더 이름을 입력해주세요.
                      </DialogDescription>
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
                <Link href="/instructor/new">
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    새 시험 만들기
                  </Button>
                </Link>
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
            {breadcrumb.map((item, index) => (
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

          {/* Folder/Exam List */}
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            onDragOver={handleRootDragOver}
            onDrop={handleRootDrop}
          >
            {isLoading ? (
              <div className="col-span-full flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
              </div>
            ) : nodes.length === 0 ? (
              <div className="col-span-full text-center py-12 border-2 border-dashed border-muted-foreground/20 rounded-lg">
                <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  이 폴더가 비어있습니다.
                </p>
                <div className="flex items-center justify-center space-x-2">
                  <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <FolderPlus className="w-4 h-4 mr-2" />
                        폴더 만들기
                      </Button>
                    </DialogTrigger>
                  </Dialog>
                  <Link href="/instructor/new">
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      시험 만들기
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              nodes.map((node) => (
                <Card
                  key={node.id}
                  draggable={!isMoving}
                  onDragStart={(e) => handleDragStart(e, node)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, node)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, node)}
                  className={`border-0 shadow-lg hover:shadow-xl transition-all duration-200 group ${
                    draggedNode?.id === node.id
                      ? "opacity-50 scale-95 cursor-grabbing"
                      : "cursor-grab active:cursor-grabbing"
                  } ${
                    dragOverNodeId === node.id && node.kind === "folder"
                      ? "ring-2 ring-primary ring-offset-2 bg-primary/10 scale-105"
                      : ""
                  } ${
                    isMoving ? "pointer-events-none opacity-60" : ""
                  } ${
                    node.kind === "exam" && draggedNode
                      ? "cursor-not-allowed"
                      : ""
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div
                        className="flex-1"
                        onClick={() => {
                          if (isMoving) return;
                          if (node.kind === "folder") {
                            handleFolderClick(node.id);
                          } else if (node.exam_id) {
                            router.push(`/instructor/${node.exam_id}`);
                          }
                        }}
                      >
                        <div className="flex items-center space-x-3 mb-2">
                          {node.kind === "folder" ? (
                            <Folder
                              className={`w-8 h-8 text-primary ${
                                draggedNode?.id === node.id
                                  ? "animate-pulse"
                                  : ""
                              }`}
                            />
                          ) : (
                            <FileText
                              className={`w-8 h-8 text-blue-500 ${
                                draggedNode?.id === node.id
                                  ? "animate-pulse"
                                  : ""
                              }`}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground truncate">
                              {node.name}
                            </h3>
                            {node.kind === "exam" && node.exams && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {node.exams.code}
                              </p>
                            )}
                          </div>
                        </div>
                        {node.kind === "exam" && node.exams && (
                          <div className="flex items-center space-x-2 mt-2">
                            <Badge
                              variant={
                                node.exams.status === "active"
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {node.exams.status === "active"
                                ? "활성"
                                : node.exams.status === "draft"
                                ? "초안"
                                : "완료"}
                            </Badge>
                          </div>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
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
                              handleDeleteNode(node.id, node.name);
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            삭제
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </main>
      </div>
    </SignedIn>
  );
}

