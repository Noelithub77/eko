import type { ReactNode } from "react";

export function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mobile-shell bg-background text-foreground">
      <main className="mx-auto grid w-full max-w-[430px] gap-3 px-4">{children}</main>
    </div>
  );
}
