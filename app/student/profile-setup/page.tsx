"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, GraduationCap, Hash, Loader2 } from "lucide-react";

interface University {
  name: string;
  type: string;
  category: string;
  branch: string;
  address: string;
  fullName: string;
}

export default function ProfileSetupPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [name, setName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [school, setSchool] = useState("");
  const [schoolSearchQuery, setSchoolSearchQuery] = useState("");
  const [schoolSuggestions, setSchoolSuggestions] = useState<University[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [error, setError] = useState("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Redirect if not student or not loaded
  useEffect(() => {
    if (isLoaded && !user) {
      router.push("/sign-in");
      return;
    }

    if (isLoaded && user) {
      const userRole = (user?.unsafeMetadata?.role as string) || "student";
      if (userRole !== "student") {
        router.push("/instructor");
        return;
      }

      // Load existing profile if exists
      loadExistingProfile();
    }
  }, [isLoaded, user, router]);

  const loadExistingProfile = async () => {
    try {
      setIsLoadingProfile(true);
      const response = await fetch("/api/student/profile");
      if (response.ok) {
        const data = await response.json();
        if (data.profile) {
          // Load existing profile data
          setName(data.profile.name || "");
          setStudentNumber(data.profile.student_number || "");
          setSchool(data.profile.school || "");
          setSchoolSearchQuery(data.profile.school || "");
        }
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // 학교 검색 (디바운싱)
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
          `/api/universities/search?q=${encodeURIComponent(
            schoolSearchQuery
          )}&limit=10`
        );
        if (response.ok) {
          const data = await response.json();
          setSchoolSuggestions(data.universities || []);
        }
      } catch (error) {
        console.error("Error searching universities:", error);
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

  // 외부 클릭 시 드롭다운 닫기
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    if (!studentNumber.trim()) {
      setError("학번을 입력해주세요.");
      return;
    }
    if (!school.trim()) {
      setError("학교를 선택해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/student/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          student_number: studentNumber.trim(),
          school: school.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // 성공 시 학생 대시보드로 리다이렉트
        router.push("/student");
      } else {
        setError(data.error || "프로필 저장에 실패했습니다.");
      }
    } catch (error) {
      console.error("Error saving profile:", error);
      setError("서버 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded || isLoadingProfile) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-xl border-0">
        <CardHeader className="text-center space-y-4">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
            <User className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">프로필 설정</CardTitle>
          <CardDescription className="text-base">
            {isLoadingProfile
              ? "프로필 정보를 불러오는 중..."
              : "학생 정보를 입력하거나 수정해주세요. 시험 참여를 위해 필수 정보입니다."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 이름 입력 */}
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
                className="w-full"
              />
            </div>

            {/* 학번 입력 */}
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
                className="w-full"
              />
            </div>

            {/* 학교 검색 */}
            <div className="space-y-2">
              <Label htmlFor="school" className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4" />
                학교
              </Label>
              <div className="relative">
                <Input
                  ref={inputRef}
                  id="school"
                  type="text"
                  placeholder="학교명을 검색하세요"
                  value={schoolSearchQuery}
                  onChange={(e) => {
                    setSchoolSearchQuery(e.target.value);
                    if (e.target.value !== school) {
                      setSchool("");
                    }
                  }}
                  required
                  className="w-full"
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {/* 검색 결과 드롭다운 */}
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
                  선택된 학교: <span className="font-medium">{school}</span>
                </p>
              )}
            </div>

            {/* 에러 메시지 */}
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                {error}
              </div>
            )}

            {/* 제출 버튼 */}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !name || !studentNumber || !school}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  저장 중...
                </>
              ) : (
                "프로필 저장"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
