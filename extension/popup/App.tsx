import { useState } from "react";
import { AppWindow, AudioLines, ChevronDown, Headphones, Layers, MonitorSpeaker, Moon, PanelsTopLeft, Settings, Square, Sun,
  Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { DesktopLayout } from "../../frontend/desktop/layouts/DesktopLayout";
import { QrPairingCard } from "../../frontend/desktop/features/pairing/QrPairingCard";
import { DeviceList } from "../../frontend/desktop/features/devices/DeviceList";
import { Button } from "@shared/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@shared/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { Spinner } from "@shared/components/ui/spinner";
import { Toaster } from "@shared/components/ui/sonner";
import { cn } from "@shared/lib/utils";
import { sourceSchema, type CaptureSource } from "../runtime/messages";
import { useHost } from "./useHost";

const sources: Record<CaptureSource, { label: string; heading: string; Icon: LucideIcon }> = {
  tab: { label: "This tab", heading: "Share this tab", Icon: AppWindow },
  otherTab: { label: "Another tab", heading: "Share a tab", Icon: Layers },
  window: { label: "A window", heading: "Share a window", Icon: PanelsTopLeft },
  screen: { label: "System audio", heading: "Share system audio", Icon: MonitorSpeaker },
};

export default function App() {
  const { state, pending, error, tabTitle, run } = useHost();
  const [source, setSource] = useState<CaptureSource>("tab");
  const { heading, Icon } = sources[source];
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
      </> : <div className="flex flex-1 flex-col items-center justify-center gap-7 pb-10 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-coral/10 text-coral"><Icon className="size-7" /></div>
        <div className="w-full">
          <DropdownMenu>
            <h1><DropdownMenuTrigger disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg px-2 text-3xl font-bold tracking-tight outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              {heading}<ChevronDown className="size-5 text-muted-foreground" />
            </DropdownMenuTrigger></h1>
            <DropdownMenuContent align="center" className="w-48">
              <DropdownMenuRadioGroup value={source} onValueChange={(value) => {
                const parsed = sourceSchema.safeParse(value);
                if (parsed.success) setSource(parsed.data);
              }}>
                {sourceSchema.options.map((option) => {
                  const { label, Icon: OptionIcon } = sources[option];
                  return <DropdownMenuRadioItem key={option} value={option}><OptionIcon />{label}</DropdownMenuRadioItem>;
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="mt-2 truncate text-sm text-muted-foreground">{source === "tab" ? tabTitle : "Chrome asks what to share"}</p>
        </div>
        <Button size="lg" disabled={pending} onClick={() => void run({ type: "start", source })}>
          {pending ? <Spinner /> : <AudioLines />}Start sharing
        </Button>
      </div>}
    </div>
    <Toaster />
  </DesktopLayout>;
}
