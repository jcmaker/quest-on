import { DashboardPageFallback } from "@/components/dashboard/DashboardPageFallback";

export default function InstructorLoading() {
  return (
    <DashboardPageFallback
      title="강사 대시보드를 불러오는 중..."
      description="시험 목록과 폴더 구조를 순차적으로 준비하고 있습니다."
    />
  );
}
