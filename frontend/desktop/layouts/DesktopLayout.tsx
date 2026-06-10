import type { ReactNode } from "react";

export function DesktopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-[1760px] items-center justify-between px-8 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Eko</h1>
            <p className="text-base text-muted-foreground">Echo your device audio with lots of devices</p>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1760px] px-8 py-8">{children}</main>
    </div>
  );
}
