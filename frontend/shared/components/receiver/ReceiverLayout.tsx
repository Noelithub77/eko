import type { ReactNode } from "react";
import { EkoMark } from "../EkoMark";

export function ReceiverLayout({ label, children }: { label: string; children: ReactNode }) {
  return <div className="receiver-shell bg-background text-foreground">
    <main className="mx-auto flex h-full min-h-0 w-full max-w-[430px] flex-col justify-center gap-3 px-4">
      <header className="flex shrink-0 items-center gap-3 py-2">
        <EkoMark animated className="size-11" />
        <div><h1 className="text-2xl font-bold leading-tight tracking-tight">eko</h1>
          <p className="text-sm text-muted-foreground">{label}</p></div>
      </header>
      {children}
    </main>
  </div>;
}
