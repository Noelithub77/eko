import { useEffect, useRef, useState } from "react";
import { Bug, RefreshCw, Settings, Wifi, X } from "lucide-react";
import { DesktopLayout } from "./layouts/DesktopLayout";
import { useSettingsStore } from "@shared/stores/settings-store";
import { useStreamStore } from "@shared/stores/stream-store";
import { initAppLogging } from "@shared/utils/logger";
import { DevPanel } from "./features/dev/DevPanel";
import { DeviceList } from "./features/devices/DeviceList";
import { QrPairingCard } from "./features/pairing/QrPairingCard";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { NowPlayingCard } from "./features/stream/NowPlayingCard";
import "./App.css";

function App() {
  const [view, setView] = useState<"stream" | "settings" | "dev">("stream");
  const session = useStreamStore((state) => state.session);
  const qrPayload = useStreamStore((state) => state.qrPayload);
  const errorMessage = useStreamStore((state) => state.errorMessage);
  const listenToSessionEvents = useStreamStore((state) => state.listenToSessionEvents);
  const restart = useStreamStore((state) => state.restart);
  const allow = useStreamStore((state) => state.allow);
  const deny = useStreamStore((state) => state.deny);
  const unblock = useStreamStore((state) => state.unblock);
  const disconnect = useStreamStore((state) => state.disconnect);
  const toggleSharing = useStreamStore((state) => state.toggleSharing);
  const addTestDevice = useStreamStore((state) => state.addTestDevice);
  const devMode = useSettingsStore((state) => state.devMode);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const setDevMode = useSettingsStore((state) => state.setDevMode);
  const startedOnOpen = useRef(false);

  const isRunning = session?.status === "running";

  useEffect(() => {
    void initAppLogging();
    loadSettings();
    if (!startedOnOpen.current) {
      startedOnOpen.current = true;
      void restart();
    }
  }, [loadSettings, restart]);

  useEffect(() => {
    let stopListening: (() => void) | null = null;
    let mounted = true;

    void listenToSessionEvents().then((unlisten) => {
      if (mounted) {
        stopListening = unlisten;
        return;
      }
      unlisten();
    });

    return () => {
      mounted = false;
      stopListening?.();
    };
  }, [listenToSessionEvents]);

  const headerActions = (
    <>
      <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm">
        <Wifi className="size-4 text-green-500" />
        <span className="text-muted-foreground">
          {isRunning ? "Ready for phones" : "Starting stream"}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void restart()}
        className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Restart stream"
        title="Restart stream"
      >
        <RefreshCw className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => setView((v) => (v === "settings" ? "stream" : "settings"))}
        className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={view === "settings" ? "Close settings" : "Settings"}
        title={view === "settings" ? "Close settings" : "Settings"}
      >
        {view === "settings" ? <X className="size-5" /> : <Settings className="size-5" />}
      </button>
      {devMode ? (
        <button
          type="button"
          onClick={() => setView((v) => (v === "dev" ? "stream" : "dev"))}
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Dev"
          title="Dev"
        >
          <Bug className="size-5" />
        </button>
      ) : null}
    </>
  );

  return (
    <DesktopLayout actions={headerActions}>
      {view === "stream" ? (
        <div className="grid min-h-0 h-full gap-6 overflow-hidden lg:grid-cols-[minmax(300px,1fr)_minmax(360px,1.2fr)]">
          <div className="grid min-h-0 h-full grid-rows-[auto_1fr] gap-6 overflow-hidden">
            <NowPlayingCard />
            <QrPairingCard payload={qrPayload} />
          </div>
          <DeviceList
            devices={session?.devices ?? []}
            onAllow={allow}
            onDeny={deny}
            onDisconnect={disconnect}
            onSharingChange={toggleSharing}
            onUnblock={unblock}
          />
        </div>
      ) : null}
      {view === "settings" ? (
        <div className="mt-4">
          <SettingsPanel devMode={devMode} onDevModeChange={setDevMode} />
        </div>
      ) : null}
      {view === "dev" ? (
        <div className="mt-4">
          <DevPanel
            onAddTestDevice={() => addTestDevice("Android test phone", "qr")}
            session={session}
          />
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-4 rounded-md border border-destructive/30 p-3 text-sm">
          {errorMessage}
        </div>
      ) : null}
    </DesktopLayout>
  );
}

export default App;
