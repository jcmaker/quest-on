import { DashboardPageFallback } from "@/components/dashboard/DashboardPageFallback";

export default function StudentLoading() {
  return (
    <DashboardPageFallback
      title="학생 대시보드를 불러오는 중..."
      description="세션 목록과 통계를 순차적으로 준비하고 있습니다."
    />
  );
}
