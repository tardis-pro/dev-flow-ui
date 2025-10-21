import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DevFlow",
  description:
    "Control and visualize the Navratna development workflow across issues, artifacts, Gemini runs, and PRs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={cn("min-h-screen bg-slate-950 text-slate-100 antialiased", inter.variable)}>
        <Providers>
          <div className="flex min-h-screen flex-col">{children}</div>
        </Providers>
        <Toaster richColors closeButton toastOptions={{ duration: 4000 }} />
      </body>
    </html>
  );
}
