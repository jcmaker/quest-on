import type { Metadata } from "next";
import { Geist, Geist_Mono, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ConditionalHeader } from "@/components/ConditionalHeader";
import { Toaster } from "@/components/ui/sonner";
import QueryProvider from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
  openGraph: {
    title: "Quest-On",
    description:
      "Connect instructors and students in an engaging, interactive learning environment",
    images: [
      {
        url: "/qstn_og.png",
        width: 1200,
        height: 630,
        alt: "Quest-On",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Quest-On",
    description:
      "Connect instructors and students in an engaging, interactive learning environment",
    images: ["/qstn_og.png"],
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
          className={`${geistSans.variable} ${geistMono.variable} ${robotoMono.variable} antialiased`}
          suppressHydrationWarning={true}
        >
          <ThemeProvider>
            <QueryProvider>
              <ConditionalHeader />
              {children}
              <Toaster />
            </QueryProvider>
            <Analytics />
          </ThemeProvider>
        </body>
      </ClerkProvider>
    </html>
  );
}
