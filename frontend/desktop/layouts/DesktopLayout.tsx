import type { ReactNode } from "react";

export function DesktopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="desktop-layout">
      <header>
        <h1>eko</h1>
      </header>
      <main>{children}</main>
    </div>
  );
}
