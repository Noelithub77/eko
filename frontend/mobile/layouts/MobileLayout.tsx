import type { ReactNode } from "react";

export function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-5 text-foreground">
      <main className="mx-auto grid max-w-sm gap-4">{children}</main>
    </div>
  );
}
