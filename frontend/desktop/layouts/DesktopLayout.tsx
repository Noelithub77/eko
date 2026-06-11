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
    <div className="flex h-screen flex-col bg-muted/30 text-foreground">
      <header className="shrink-0 border-b bg-background">
        <div className="mx-auto flex w-full items-center justify-between px-6 py-4 lg:px-8">
          <div>
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
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      </header>
      <main className="mx-auto w-full flex-1 overflow-hidden px-4 py-4 lg:px-8 lg:py-6">
        {children}
      </main>
    </div>
  );
}
