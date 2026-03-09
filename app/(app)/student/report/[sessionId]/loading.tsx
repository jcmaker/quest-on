export default function ReportLoading() {
  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <div className="mb-8 space-y-4">
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="h-8 w-80 animate-pulse rounded bg-muted" />
        <div className="h-4 w-56 animate-pulse rounded bg-muted/70" />
        <div className="h-8 w-44 animate-pulse rounded bg-muted" />
      </div>

      <div className="mb-6 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-24 animate-pulse rounded-md bg-muted"
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
          <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />
          <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
        </div>
        <div className="space-y-6">
          <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
          <div className="h-36 animate-pulse rounded-2xl border border-border bg-card" />
        </div>
      </div>
    </div>
  );
}
