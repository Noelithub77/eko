import { useEffect, useRef } from "react";
import { DesktopLayout } from "./layouts/DesktopLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/components/ui/tabs";
import { useSettingsStore } from "@shared/stores/settings-store";
import { useStreamStore } from "@shared/stores/stream-store";
import { initAppLogging } from "@shared/utils/logger";
import { DevPanel } from "./features/dev/DevPanel";
import { DeviceList } from "./features/devices/DeviceList";
import { QrPairingCard } from "./features/pairing/QrPairingCard";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { StreamControls } from "./features/stream/StreamControls";
import "./App.css";

function App() {
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

  return (
    <DesktopLayout>
      <Tabs className="flex h-full flex-col" defaultValue="stream">
        <TabsList>
          <TabsTrigger value="stream">Stream</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          {devMode ? <TabsTrigger value="dev">Dev</TabsTrigger> : null}
        </TabsList>
        <TabsContent
          className="mt-6 grid min-h-0 flex-1 gap-6 overflow-hidden lg:grid-cols-[minmax(300px,1fr)_minmax(360px,1.2fr)]"
          value="stream"
        >
          <div className="grid min-h-0 grid-rows-[auto_1fr] gap-6 overflow-hidden">
            <StreamControls onRestart={restart} session={session} />
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
        </TabsContent>
        <TabsContent className="mt-4" value="settings">
          <SettingsPanel devMode={devMode} onDevModeChange={setDevMode} />
        </TabsContent>
        {devMode ? (
          <TabsContent className="mt-4" value="dev">
            <DevPanel
              onAddTestDevice={() => addTestDevice("Android test phone", "qr")}
              session={session}
            />
          </TabsContent>
        ) : null}
      </Tabs>
      {errorMessage ? (
        <div className="mt-4 rounded-md border border-destructive/30 p-3 text-sm">
          {errorMessage}
        </div>
      ) : null}
    </DesktopLayout>
  );
}

export default App;
