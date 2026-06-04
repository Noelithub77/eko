import type { ReactNode } from "react";

export function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mobile-layout">
      <main>{children}</main>
      <nav className="bottom-nav">
        <button>Home</button>
        <button>Search</button>
        <button>Profile</button>
      </nav>
    </div>
  );
}
