"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function StudentListItemSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
      <div className="flex items-start gap-4 min-w-0 flex-1">
        <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 self-end sm:self-auto flex-shrink-0">
        <div className="text-right min-w-[100px] sm:min-w-[120px] space-y-1">
          <Skeleton className="h-6 w-12 ml-auto" />
          <Skeleton className="h-3 w-16 ml-auto" />
        </div>
        <Skeleton className="h-8 w-16 sm:w-20" />
      </div>
    </div>
  );
}
