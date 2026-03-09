"use client";

import { useState, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import type { InstructorStudent, SortOption } from "@/lib/types/exam";

interface UseStudentFilteringOptions {
  students: InstructorStudent[];
}

export function useStudentFiltering({ students }: UseStudentFilteringOptions) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("score");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const filteredAndSortedStudents = useMemo(() => {
    const filtered = students.filter((student) => {
      const query = debouncedSearchQuery.toLowerCase();
      return (
        student.name.toLowerCase().includes(query) ||
        student.email.toLowerCase().includes(query) ||
        student.student_number?.toLowerCase().includes(query) ||
        student.school?.toLowerCase().includes(query)
      );
    });

    filtered.sort((a, b) => {
      switch (sortOption) {
        case "score":
          if (a.score !== undefined && b.score === undefined) return -1;
          if (a.score === undefined && b.score !== undefined) return 1;
          if (a.score !== undefined && b.score !== undefined) {
            return b.score - a.score;
          }
          return 0;
        case "questionCount":
          if (a.questionCount !== undefined && b.questionCount === undefined) return -1;
          if (a.questionCount === undefined && b.questionCount !== undefined) return 1;
          if (a.questionCount !== undefined && b.questionCount !== undefined) {
            return b.questionCount - a.questionCount;
          }
          return 0;
        case "answerLength":
          if (a.answerLength !== undefined && b.answerLength === undefined) return -1;
          if (a.answerLength === undefined && b.answerLength !== undefined) return 1;
          if (a.answerLength !== undefined && b.answerLength !== undefined) {
            return b.answerLength - a.answerLength;
          }
          return 0;
        case "submittedAt":
          if (a.submittedAt && !b.submittedAt) return -1;
          if (!a.submittedAt && b.submittedAt) return 1;
          if (a.submittedAt && b.submittedAt) {
            return (
              new Date(b.submittedAt).getTime() -
              new Date(a.submittedAt).getTime()
            );
          }
          return 0;
        default:
          return 0;
      }
    });

    return filtered;
  }, [students, debouncedSearchQuery, sortOption]);

  const gradedStudents = useMemo(() => {
    return filteredAndSortedStudents
      .filter((s) => s.isGraded)
      .sort((a, b) => {
        if (a.finalScore !== undefined && b.finalScore === undefined) return -1;
        if (a.finalScore === undefined && b.finalScore !== undefined) return 1;
        if (a.finalScore !== undefined && b.finalScore !== undefined) {
          return b.finalScore - a.finalScore;
        }
        return 0;
      });
  }, [filteredAndSortedStudents]);

  const nonGradedStudents = useMemo(() => {
    return filteredAndSortedStudents.filter((s) => !s.isGraded);
  }, [filteredAndSortedStudents]);

  return {
    searchQuery,
    setSearchQuery,
    sortOption,
    setSortOption,
    filteredAndSortedStudents,
    gradedStudents,
    nonGradedStudents,
  };
}
