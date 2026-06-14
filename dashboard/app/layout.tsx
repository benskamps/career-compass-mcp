import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavBar } from "@/components/layout/nav-bar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { loadCareerData } from "@/lib/data";
import { calculateCompleteness } from "@/lib/completeness";
import pkg from "../../package.json";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Career Compass",
  description: "Your AI-native career co-pilot",
};

// Force dynamic rendering for the entire dashboard. Every route reads
// user-owned YAML from CAREER_DATA_PATH at request time, so prerendering at
// `next build` would bake the build environment's data (or empty state) into
// the shipped standalone artifact and serve it to every user. A layout-level
// route segment config propagates to all nested routes. See audit P0.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const career = await loadCareerData();
  const score = career ? calculateCompleteness(career) : 0;
  const dataPath = process.env.CAREER_DATA_PATH ?? "~/.career-compass";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}})()",
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground`}>
        <ThemeProvider>
          <TooltipProvider>
            <NavBar completenessScore={score} dataPath={dataPath} version={pkg.version} />
            <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
