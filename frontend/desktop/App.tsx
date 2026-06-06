import { useEffect } from "react";
import { DesktopLayout } from "./layouts/DesktopLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/components/ui/tabs";
import { useSettingsStore } from "@shared/stores/settings-store";
import { useStreamStore } from "@shared/stores/stream-store";
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
  const refreshSession = useStreamStore((state) => state.refreshSession);
  const start = useStreamStore((state) => state.start);
  const stop = useStreamStore((state) => state.stop);
  const toggleLanDiscovery = useStreamStore((state) => state.toggleLanDiscovery);
  const allow = useStreamStore((state) => state.allow);
  const deny = useStreamStore((state) => state.deny);
  const unblock = useStreamStore((state) => state.unblock);
  const disconnect = useStreamStore((state) => state.disconnect);
  const toggleSharing = useStreamStore((state) => state.toggleSharing);
  const addTestDevice = useStreamStore((state) => state.addTestDevice);
  const devMode = useSettingsStore((state) => state.devMode);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const setDevMode = useSettingsStore((state) => state.setDevMode);

  useEffect(() => {
    loadSettings();
    refreshSession();
  }, [loadSettings, refreshSession]);

  useEffect(() => {
    if (session?.status !== "running") {
      return;
    }
    const timer = window.setInterval(() => {
      refreshSession();
    }, 800);

    return () => window.clearInterval(timer);
  }, [refreshSession, session?.status]);

  return (
    <DesktopLayout>
      <Tabs defaultValue="stream">
        <TabsList>
          <TabsTrigger value="stream">Stream</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          {devMode ? <TabsTrigger value="dev">Dev</TabsTrigger> : null}
        </TabsList>
        <TabsContent className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]" value="stream">
          <div className="grid content-start gap-4">
            <StreamControls
              onLanChange={toggleLanDiscovery}
              onStart={start}
              onStop={stop}
              session={session}
            />
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
