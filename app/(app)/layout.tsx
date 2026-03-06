import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { ConditionalHeader } from "@/components/ConditionalHeader";
import QueryProvider from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { clerkAppearance, clerkLocalization } from "@/lib/clerk-config";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={clerkAppearance}
      localization={clerkLocalization}
    >
      <ThemeProvider>
        <QueryProvider>
          <ConditionalHeader />
          {children}
          <Toaster />
        </QueryProvider>
        <Analytics />
      </ThemeProvider>
    </ClerkProvider>
  );
}
