interface DashboardPageFallbackProps {
  title: string;
  description: string;
}

export function DashboardPageFallback({
  title,
  description,
}: DashboardPageFallbackProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <div className="h-8 w-56 animate-pulse rounded bg-muted" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted/70" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-2xl border border-border bg-card"
            />
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <div className="h-[420px] animate-pulse rounded-2xl border border-border bg-card" />
          <div className="h-[420px] animate-pulse rounded-2xl border border-border bg-card" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
