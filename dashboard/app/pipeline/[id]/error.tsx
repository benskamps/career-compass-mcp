"use client";

import Link from "next/link";

export default function ApplicationError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
      <div className="text-4xl mb-4">⚠️</div>
      <h2 className="text-xl font-semibold mb-2">Failed to load application</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        {error.message || "The career data file may be corrupted or inaccessible."}
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-button font-medium hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
        <Link
          href="/pipeline"
          className="px-4 py-2 border border-border text-muted-foreground rounded-button hover:text-foreground transition-colors"
        >
          Back to pipeline
        </Link>
      </div>
    </div>
  );
}
