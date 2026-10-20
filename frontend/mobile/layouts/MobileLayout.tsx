import type { ReactNode } from "react";

export function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mobile-shell bg-background text-foreground">
      <main className="mx-auto grid min-h-0 w-full max-w-[430px] content-start gap-3 overflow-y-auto px-4">{children}</main>
    </div>
  );
}
