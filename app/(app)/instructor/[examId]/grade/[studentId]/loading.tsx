export default function GradeLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
          <div className="h-6 w-64 animate-pulse rounded bg-muted" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
          <div className="space-y-4">
            <div className="h-12 animate-pulse rounded-lg border border-border bg-card" />
            <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
            <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />
            <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
          </div>
          <div className="space-y-4">
            <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
            <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
          </div>
        </div>
      </div>
    </div>
  );
}
