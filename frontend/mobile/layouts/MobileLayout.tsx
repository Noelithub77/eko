import type { ReactNode } from "react";

export function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mobile-layout">
      <main>{children}</main>
      <nav className="bottom-nav">
        <button type="button">Home</button>
        <button type="button">Search</button>
        <button type="button">Profile</button>
      </nav>
    </div>
  );
}
