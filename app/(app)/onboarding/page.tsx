"use client";

import { useEffect, useState, useRef } from "react";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CenteredViewportShell } from "@/components/layout/CenteredViewportShell";
import { User, Hash, GraduationCap, Loader2, ArrowLeft } from "lucide-react";
import { ErrorAlert } from "@/components/ui/error-alert";

interface University {
  name: string;
  type: string;
  category: string;
  branch: string;
  address: string;
  fullName: string;
}

export default function OnboardingPage() {
  const { user, isLoaded } = useAppUser();
  const router = useRouter();

  // Step: "role" | "profile"
  const [step, setStep] = useState<"role" | "profile">("role");
  const [role, setRole] = useState<"instructor" | "student">("student");
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Profile fields (shared)
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [schoolSearchQuery, setSchoolSearchQuery] = useState("");
  const [schoolSuggestions, setSchoolSuggestions] = useState<University[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Student-only fields
  const [studentNumber, setStudentNumber] = useState("");

  // Get role from localStorage if available
  useEffect(() => {
    const savedRole = localStorage.getItem("selectedRole");
    if (savedRole && (savedRole === "instructor" || savedRole === "student")) {
      setRole(savedRole as "instructor" | "student");
    }
  }, []);

  useEffect(() => {
    if (isLoaded && !user) {
      router.push("/sign-in");
    }
  }, [isLoaded, user, router]);

  // University search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (schoolSearchQuery.trim().length === 0) {
      setSchoolSuggestions([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/universities/search?q=${encodeURIComponent(schoolSearchQuery)}`
        );
        if (response.ok) {
          const data = await response.json();
          setSchoolSuggestions(data.universities || []);
        }
      } catch {
        // Ignore search errors
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [schoolSearchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setSchoolSuggestions([]);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSchoolSelect = (university: University) => {
    setSchool(university.fullName);
    setSchoolSearchQuery(university.fullName);
    setSchoolSuggestions([]);
  };

  const handleRoleConfirm = () => {
    setShowConfirm(false);
    setStep("profile");
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    if (!school.trim()) {
      setError("학교를 선택해주세요.");
      return;
    }
    if (role === "student" && !studentNumber.trim()) {
      setError("학번을 입력해주세요.");
      return;
    }

    if (!user) return;
    setIsSubmitting(true);

    try {
      // 1. profiles 테이블에 role/status 업데이트
      const profileRes = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          status: role === "instructor" ? "pending" : "approved",
        }),
      });
      if (!profileRes.ok) throw new Error("Profile update failed");

      // 2. role별 추가 프로필 저장
      if (role === "student") {
        const res = await fetch("/api/student/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            student_number: studentNumber.trim(),
            school: school.trim(),
          }),
        });
        if (!res.ok) throw new Error("Student profile save failed");
      } else {
        const res = await fetch("/api/instructor/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: user.email,
            school: school.trim(),
          }),
        });
        if (!res.ok) throw new Error("Instructor profile save failed");
      }

      // 3. Clear localStorage
      localStorage.removeItem("selectedRole");

      // 4. Redirect
      const params = new URLSearchParams(window.location.search);
      const redirectUrl =
        params.get("redirect") || localStorage.getItem("onboarding_redirect");
      localStorage.removeItem("onboarding_redirect");

      if (redirectUrl && redirectUrl.startsWith("/")) {
        router.push(redirectUrl);
      } else if (role === "instructor") {
        router.push("/instructor-pending");
      } else {
        sessionStorage.setItem("profile-setup-complete", "true");
        router.push("/student");
      }
    } catch {
      setError("저장에 실패했습니다. 다시 시도해주세요.");
      setIsSubmitting(false);
    }
  };

  if (!isLoaded || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <CenteredViewportShell
      className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900"
      contentClassName="max-w-md"
    >
      {step === "role" ? (
        /* ── Step 1: Role Selection ── */
        <Card className="w-full shadow-xl border-0">
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-2xl">
              Quest-On에 오신 것을 환영합니다!
            </CardTitle>
            <CardDescription className="text-base">
              시작하려면 역할을 선택해주세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup
              value={role}
              onValueChange={(value) =>
                setRole(value as "instructor" | "student")
              }
            >
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="instructor" id="instructor" />
                <Label
                  htmlFor="instructor"
                  className="text-base cursor-pointer flex-1"
                >
                  강사 (시험 출제자)
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="student" id="student" />
                <Label
                  htmlFor="student"
                  className="text-base cursor-pointer flex-1"
                >
                  학생 (시험 응시자)
                </Label>
              </div>
            </RadioGroup>

            <Button
              onClick={() => setShowConfirm(true)}
              className="w-full h-12 text-lg"
            >
              계속하기
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* ── Step 2: Profile Info ── */
        <Card className="w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
              <User className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">프로필 설정</CardTitle>
            <CardDescription className="text-base">
              {role === "student"
                ? "학생 정보를 입력해주세요"
                : "강사 정보를 입력해주세요"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="space-y-6">
              {/* 이름 */}
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  이름
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="이름을 입력하세요"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              {/* 학번 (학생만) */}
              {role === "student" && (
                <div className="space-y-2">
                  <Label
                    htmlFor="studentNumber"
                    className="flex items-center gap-2"
                  >
                    <Hash className="w-4 h-4" />
                    학번
                  </Label>
                  <Input
                    id="studentNumber"
                    type="text"
                    placeholder="학번을 입력하세요"
                    value={studentNumber}
                    onChange={(e) => setStudentNumber(e.target.value)}
                    required
                  />
                </div>
              )}

              {/* 학교 (공통) */}
              <div className="space-y-2">
                <Label htmlFor="school" className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4" />
                  {role === "student" ? "학교" : "소속 기관"}
                </Label>
                <div className="relative">
                  <Input
                    ref={inputRef}
                    id="school"
                    type="text"
                    placeholder={
                      role === "student"
                        ? "학교명을 검색하세요"
                        : "소속 기관명을 검색하세요"
                    }
                    value={schoolSearchQuery}
                    onChange={(e) => {
                      setSchoolSearchQuery(e.target.value);
                      if (e.target.value !== school) {
                        setSchool("");
                      }
                    }}
                    required
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {schoolSuggestions.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto"
                    >
                      {schoolSuggestions.map((uni, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleSchoolSelect(uni)}
                          className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground transition-colors border-b last:border-b-0"
                        >
                          <div className="font-medium">{uni.fullName}</div>
                          <div className="text-sm text-muted-foreground">
                            {uni.type} · {uni.category}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {school && (
                  <p className="text-sm text-muted-foreground">
                    선택된 학교:{" "}
                    <span className="font-medium">{school}</span>
                  </p>
                )}
              </div>

              {error && <ErrorAlert message={error} />}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("role")}
                  disabled={isSubmitting}
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  이전
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={
                    isSubmitting ||
                    !name ||
                    !school ||
                    (role === "student" && !studentNumber)
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    "완료"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Role Confirm Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>역할을 확인해주세요</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">
                {role === "instructor"
                  ? "강사 (시험 출제자)"
                  : "학생 (시험 응시자)"}
              </span>
              (으)로 시작합니다. 역할 선택 후에도 프로필 설정에서 변경할 수
              있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>다시 선택하기</AlertDialogCancel>
            <AlertDialogAction onClick={handleRoleConfirm}>
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CenteredViewportShell>
  );
}
