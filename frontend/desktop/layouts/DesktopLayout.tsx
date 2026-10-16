import type { ReactNode } from "react";
import { EkoMark } from "@shared/components/EkoMark";

export function DesktopLayout({
  children,
  actions,
  onEkoClick,
}: {
  children: ReactNode;
  actions?: ReactNode;
  onEkoClick?: () => void;
}) {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="shrink-0">
        <div className="flex w-full min-w-0 items-center justify-between gap-4 px-6 py-4 lg:px-12">
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-xl text-2xl font-bold tracking-tight"
            onClick={onEkoClick}
            aria-label="eko home"
          >
            <EkoMark animated className="size-8" />
            eko
          </button>
          <div className="flex shrink-0 items-center justify-end gap-1">{actions}</div>
        </div>
      </header>
      <main className="min-h-0 w-full flex-1 overflow-y-auto px-6 pb-8 lg:px-12 lg:pb-12">
        {children}
      </main>
    </div>
  );
}
