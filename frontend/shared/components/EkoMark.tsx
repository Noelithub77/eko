import { cn } from "@shared/lib/utils";

type EkoMarkProps = {
  className?: string;
  /** Turns the echo into place once when the mark mounts. */
  animated?: boolean;
};

// The Turn mark: a coral sound and its teal echo, the same shape turned 180°.
export function EkoMark({ className, animated = false }: EkoMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
      fill="none"
      strokeLinecap="round"
      strokeWidth={5}
      viewBox="10 10 44 44"
    >
      <path d="M21.2 35.3A11 11 0 1 1 35.8 23.1" stroke="#ff6b5b" />
      <circle cx="25" cy="25" fill="#ff6b5b" r="3.5" />
      <g className={cn(animated && "eko-turn")}>
        {/* Centres the group's box on the mark so it turns about (32, 32). */}
        <rect height="44" width="44" x="10" y="10" />
        <circle cx="39" cy="39" fill="#2ec4b6" r="3.5" />
        <path d="M42.8 28.7A11 11 0 1 1 28.2 40.9" stroke="#2ec4b6" />
      </g>
    </svg>
  );
}
