"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CompletenessRingProps {
  score: number;
  size?: number;
  missingFields?: string[];
}

export function CompletenessRing({ score, size = 32, missingFields }: CompletenessRingProps) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const tooltipLabel =
    score === 100
      ? "Career KB is complete!"
      : `Career KB: ${score}% complete${missingFields && missingFields.length > 0 ? `\nMissing: ${missingFields.join(", ")}` : ""}`;

  return (
    <Tooltip>
      <TooltipTrigger aria-label={tooltipLabel}>
        <div className="relative flex items-center gap-2 cursor-default rounded-md">
          <svg
            width={size}
            height={size}
            className="-rotate-90"
            role="img"
            aria-label={`Career knowledge base ${score}% complete`}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--color-brand-border, #3a3632)"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--color-accent, #D97706)"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="ring-fill-in transition-[stroke-dashoffset] duration-500 ease-out"
              style={{ ["--ring-circumference" as string]: circumference }}
            />
          </svg>
          <span className="text-xs font-mono text-text-secondary tabular-nums">{score}%</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {score === 100 ? (
          <span>Career KB is complete!</span>
        ) : (
          <span>
            Career KB: {score}% complete
            {missingFields && missingFields.length > 0 && (
              <><br />Missing: {missingFields.join(", ")}</>
            )}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
