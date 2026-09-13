import type { ReactNode } from "react";

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
    <div className="flex h-screen flex-col bg-muted text-foreground">
      <header className="shrink-0 border-b bg-background">
        <div className="mx-auto flex w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              className="block text-xl font-semibold tracking-tight lg:text-2xl"
              onClick={onEkoClick}
            >
              Eko
            </button>
            <p className="text-sm text-muted-foreground lg:text-base">
              Echo your device audio with lots of devices
            </p>
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
        </div>
      </header>
      <main className="mx-auto min-h-0 w-full flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6 xl:overflow-hidden">
        {children}
      </main>
    </div>
  );
}
