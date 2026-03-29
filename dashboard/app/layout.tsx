import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavBar } from "@/components/layout/nav-bar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadCareerData } from "@/lib/data";
import { calculateCompleteness } from "@/lib/completeness";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Career Compass",
  description: "Your AI-native career co-pilot",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const career = await loadCareerData();
  const score = career ? calculateCompleteness(career) : 0;
  const dataPath = process.env.CAREER_DATA_PATH ?? "~/.career-compass";

  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-bg-base text-text-primary`}>
        <TooltipProvider>
          <NavBar completenessScore={score} dataPath={dataPath} />
          <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
        </TooltipProvider>
      </body>
    </html>
  );
}
