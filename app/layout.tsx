import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ConditionalHeader } from "@/components/ConditionalHeader";
import { Toaster } from "@/components/ui/sonner";
import QueryProvider from "@/components/providers/QueryProvider";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quest-On",
  description:
    "Connect instructors and students in an engaging, interactive learning environment",
  icons: {
    icon: "/qlogo_icon.png",
    shortcut: "/qlogo_icon.png",
    apple: "/qlogo_icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning={true}>
      <ClerkProvider>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
          suppressHydrationWarning={true}
        >
          <QueryProvider>
            <ConditionalHeader />
            {children}
            <Toaster />
          </QueryProvider>
          <Analytics />
        </body>
      </ClerkProvider>
    </html>
  );
}
