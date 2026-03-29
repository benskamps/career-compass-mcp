"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { checkForData } from "@/app/onboarding/actions";

interface PhaseOneProps {
  onDataDetected: () => void;
}

export function PhaseOne({ onDataDetected }: PhaseOneProps) {
  const [detected, setDetected] = useState(false);
  const [copied, setCopied] = useState(false);
  const PROMPT = 'Set up my Career KB. Here\'s my resume:';

  useEffect(() => {
    const interval = setInterval(async () => {
      const exists = await checkForData();
      if (exists) {
        setDetected(true);
        clearInterval(interval);
        setTimeout(onDataDetected, 2000);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [onDataDetected]);

  const copyPrompt = () => {
    navigator.clipboard.writeText(PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (detected) {
    return (
      <div className="flex flex-col items-center gap-4 animate-pulse">
        <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold">Data detected!</h2>
        <p className="text-text-secondary">Setting up your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-semibold">Let&apos;s build your Career KB</h1>
        <p className="text-text-secondary">
          Career Compass needs your career history to get started. Claude will extract it from your resume.
        </p>
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3"><span className="font-mono text-accent font-semibold">1.</span><span>Open Claude (Claude Code or claude.ai with MCP configured)</span></li>
            <li className="flex gap-3"><span className="font-mono text-accent font-semibold">2.</span><span>Say the prompt below and paste your resume after it</span></li>
            <li className="flex gap-3"><span className="font-mono text-accent font-semibold">3.</span><span>Claude extracts your data into structured YAML automatically</span></li>
            <li className="flex gap-3"><span className="font-mono text-accent font-semibold">4.</span><span>Come back here — the dashboard will detect your data</span></li>
          </ol>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-bg-elevated border border-border">
            <code className="flex-1 text-sm font-mono text-accent">{PROMPT}</code>
            <Button variant="outline" size="sm" onClick={copyPrompt}>{copied ? "Copied!" : "Copy"}</Button>
          </div>
        </CardContent>
      </Card>
      <p className="text-center text-xs text-text-muted">Waiting for data at ~/.career-compass/ ...</p>
    </div>
  );
}
