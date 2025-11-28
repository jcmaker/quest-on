"use client";

import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Calendar, Shield, GraduationCap, Hash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface StudentProfile {
  id: string;
  student_id: string;
  name: string;
  student_number: string;
  school: string;
  created_at: string;
  updated_at: string;
}

export default function ProfilePage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  useEffect(() => {
    if (isLoaded && !user) {
      router.push("/sign-in");
    }
  }, [isLoaded, user, router]);

  // Load student profile if user is a student
  useEffect(() => {
    const loadStudentProfile = async () => {
      if (isLoaded && user) {
        const userRole = (user?.unsafeMetadata?.role as string) || "student";
        if (userRole === "student") {
          setIsLoadingProfile(true);
          try {
            const response = await fetch("/api/student/profile");
            if (response.ok) {
              const data = await response.json();
              if (data.profile) {
                setStudentProfile(data.profile);
              }
            }
          } catch (error) {
            console.error("Error loading student profile:", error);
          } finally {
            setIsLoadingProfile(false);
          }
        }
      }
    };

    loadStudentProfile();
  }, [isLoaded, user]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const userRole = (user?.unsafeMetadata?.role as string) || "student";
  const roleLabel =
    userRole === "instructor"
      ? "강사"
      : userRole === "admin"
      ? "관리자"
      : "학생";

  const getUserInitials = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`;
    }
    if (user.firstName) {
      return user.firstName[0];
    }
    if (user.emailAddresses[0]) {
      return user.emailAddresses[0].emailAddress[0].toUpperCase();
    }
    return "U";
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">프로필</h1>
          <p className="text-muted-foreground mt-2">
            계정 정보 및 개인 설정을 확인하세요
          </p>
        </div>

        <div className="space-y-6">
          {/* Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle>프로필 정보</CardTitle>
              <CardDescription>기본 계정 정보</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center space-x-6">
                <Avatar className="h-24 w-24">
                  <AvatarImage
                    src={user.imageUrl}
                    alt={user.fullName || "User"}
                  />
                  <AvatarFallback className="text-2xl">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold">
                    {user.fullName || "이름 없음"}
                  </h2>
                  <div className="flex items-center space-x-2 mt-2">
                    <Badge
                      variant="outline"
                      className="bg-primary/10 text-primary border-primary/20"
                    >
                      <Shield className="w-3 h-3 mr-1" />
                      {roleLabel}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 pt-4 border-t">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">이메일</p>
                    <p className="font-medium">
                      {user.emailAddresses[0]?.emailAddress || "이메일 없음"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">가입일</p>
                    <p className="font-medium">
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString("ko-KR", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })
                        : "날짜 없음"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Student Profile Information */}
              {userRole === "student" && (
                <div className="pt-4 border-t">
                  <h3 className="text-lg font-semibold mb-4">학생 정보</h3>
                  {isLoadingProfile ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                    </div>
                  ) : studentProfile ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                          <User className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">이름</p>
                          <p className="font-medium">
                            {studentProfile.name || "미입력"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                          <Hash className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">학번</p>
                          <p className="font-medium">
                            {studentProfile.student_number || "미입력"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 md:col-span-2">
                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                          <GraduationCap className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">학교</p>
                          <p className="font-medium">
                            {studentProfile.school || "미입력"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-4">
                        프로필 정보가 없습니다.
                      </p>
                      <Button
                        onClick={() => router.push("/student/profile-setup")}
                        variant="outline"
                      >
                        프로필 설정하기
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Account Details */}
          <Card>
            <CardHeader>
              <CardTitle>계정 세부 정보</CardTitle>
              <CardDescription>추가 계정 정보</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">사용자 ID</p>
                    <p className="text-sm text-muted-foreground font-mono">
                      {user.id}
                    </p>
                  </div>
                </div>
              </div>

              {user.firstName && (
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center space-x-3">
                    <User className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">이름</p>
                      <p className="text-sm text-muted-foreground">
                        {user.firstName} {user.lastName || ""}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <Shield className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">역할</p>
                    <p className="text-sm text-muted-foreground">{roleLabel}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end space-x-4">
            <Button
              variant="outline"
              onClick={() => router.back()}
            >
              돌아가기
            </Button>
            {userRole === "instructor" && (
              <Button onClick={() => router.push("/instructor")}>
                강사 대시보드
              </Button>
            )}
            {userRole === "student" && (
              <Button onClick={() => router.push("/student")}>
                학생 대시보드
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

