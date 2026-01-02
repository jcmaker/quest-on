export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950/50">
      <div className="container mx-auto max-w-4xl px-4 py-12 lg:py-16">
        {children}
      </div>
    </div>
  );
}

