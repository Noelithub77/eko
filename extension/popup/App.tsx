import { useState } from "react";
import { AudioLines, Headphones, Moon, Settings, Square, Sun, Volume2, VolumeX } from "lucide-react";
import { DesktopLayout } from "../../frontend/desktop/layouts/DesktopLayout";
import { QrPairingCard } from "../../frontend/desktop/features/pairing/QrPairingCard";
import { DeviceList } from "../../frontend/desktop/features/devices/DeviceList";
import { Button } from "@shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { Spinner } from "@shared/components/ui/spinner";
import { Toaster } from "@shared/components/ui/sonner";
import { cn } from "@shared/lib/utils";
import { useHost } from "./useHost";

export default function App() {
  const { state, pending, error, tabTitle, run } = useHost();
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));
  const active = state.status === "streaming" || state.status === "reconnecting";
  const status = state.status === "streaming" ? "Live" : state.status === "reconnecting" ? "Reconnecting" : "Ready";
  const openLink = async (url: string) => { await chrome.tabs.create({ url }); };
  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark", !dark);
    localStorage.setItem("eko-extension-theme", dark ? "light" : "dark");
    setDark(!dark);
  };
  return <DesktopLayout actions={<>
    <span role="status" className="mr-1 flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full bg-muted-foreground/40", state.status === "streaming" && "bg-teal", state.status === "reconnecting" && "bg-coral")} />
      {pending ? "Working…" : status}
    </span>
    <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Settings"><Settings /></Button></PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1.5">
        <Button variant="ghost" className="w-full justify-start" onClick={toggleTheme}>{dark ? <Sun /> : <Moon />}{dark ? "Light theme" : "Dark theme"}</Button>
        {active && <Button variant="ghost" className="w-full justify-start" disabled={pending} onClick={() => void run({ type: "mute", muted: !state.muteLocal })}>
          {state.muteLocal ? <Volume2 /> : <VolumeX />}{state.muteLocal ? "Unmute computer" : "Mute computer"}
        </Button>}
        <Button variant="ghost" className="w-full justify-start" onClick={() => void openLink(chrome.runtime.getURL("receiver.html"))}><Headphones />Listen to a host</Button>
      </PopoverContent>
    </Popover>
  </>}>
    <div className="flex min-h-full flex-col gap-5">
      {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {state.warning && <details className="text-xs text-muted-foreground"><summary>Connection notice</summary><p className="pt-2">{state.warning}</p></details>}
      {active ? <>
        <QrPairingCard payload={state.pairing} onOpenLink={openLink} compact />
        <div className="border-t pt-4" aria-busy={pending} inert={pending}>
          <DeviceList devices={state.devices}
            onAllow={(deviceId) => void run({ type: "allow", deviceId })}
            onDeny={(deviceId) => void run({ type: "deny", deviceId })}
            onDisconnect={(deviceId) => void run({ type: "disconnect", deviceId })}
            onUnblock={(deviceId) => void run({ type: "unblock", deviceId })} />
        </div>
        <div className="mt-auto flex items-center gap-3 border-t pt-4">
          <AudioLines className="size-4 shrink-0 text-teal" />
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{state.tabTitle}</span>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => void run({ type: "stop" })}><Square className="size-3 fill-current" />Stop</Button>
        </div>
      </> : <div className="flex flex-1 flex-col justify-center gap-7 pb-10">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-coral/10 text-coral"><AudioLines className="size-7" /></div>
        <div><h1 className="text-3xl font-bold tracking-tight">Share this tab</h1>
          <p className="mt-2 truncate text-sm text-muted-foreground">{tabTitle}</p></div>
        <Button className="w-fit" size="lg" disabled={pending} onClick={() => void run({ type: "start" })}>
          {pending ? <Spinner /> : <AudioLines />}Start sharing
        </Button>
      </div>}
    </div>
    <Toaster />
  </DesktopLayout>;
}
