import { useCallback, useEffect, useState } from "react";
import { MobileLayout } from "./layouts/MobileLayout";
import { EkoMark } from "@shared/components/EkoMark";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { useDeviceProfileStore } from "@shared/stores/device-profile-store";
import {
  findNearbyHosts,
  startAndroidMediaSession,
  startNativeReceiver,
  stopAndroidMediaSession,
  stopNativeReceiver,
} from "@shared/utils/api";
import { initAppLogging, logError } from "@shared/utils/logger";
import type { JoinRequest } from "@shared/types/device";
import type { DiscoveredHost, NativeReceiverEvent } from "@shared/types/signaling";
import type { QrPairingPayload } from "@shared/types/stream";
import { listen } from "@tauri-apps/api/event";
import { ConnectionStatus } from "./features/approval/ConnectionStatus";
import { NearbyHostList } from "./features/discovery/NearbyHostList";
import { ScanQrScreen } from "./features/pairing/ScanQrScreen";
import "./App.css";

type ConnectionState = "disconnected" | "waiting" | "connecting" | "connected" | "denied";

type ConnectedHost = {
  name: string;
  address: string;
};

function App() {
  const [status, setStatus] = useState<ConnectionState>("disconnected");
  const [message, setMessage] = useState("Scan or find a host.");
  const [nearbyHosts, setNearbyHosts] = useState<DiscoveredHost[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [connectedHost, setConnectedHost] = useState<ConnectedHost | null>(null);
  const deviceId = useDeviceProfileStore((state) => state.profiles.android.deviceId);
  const deviceName = useDeviceProfileStore((state) => state.profiles.android.name);
  const setReceiverName = useDeviceProfileStore((state) => state.setReceiverName);
  const finalReceiverName = useDeviceProfileStore((state) => state.finalReceiverName);

  useEffect(() => {
    void initAppLogging();
  }, []);

  useEffect(() => {
    const unlisten = listen<NativeReceiverEvent>("native-receiver-event", (event) => {
      if (event.payload.kind === "waiting") {
        setStatus("waiting");
        setMessage(event.payload.message);
        return;
      }
      if (event.payload.kind === "connecting") {
        setStatus("connecting");
        setMessage(event.payload.message);
        return;
      }
      if (event.payload.kind === "connected") {
        setStatus("connected");
        setMessage(event.payload.message);
        void startAndroidMediaSession();
        return;
      }
      if (event.payload.kind === "denied") {
        setStatus("denied");
        setMessage(event.payload.message);
        void stopAndroidMediaSession();
        return;
      }
      if (event.payload.kind === "error" || event.payload.kind === "closed") {
        setStatus("disconnected");
        setMessage(event.payload.message);
        void stopAndroidMediaSession();
      }
    });

    return () => {
      void unlisten.then((stopListening) => stopListening());
    };
  }, []);

  const requestApproval = useCallback(
    async (payload: QrPairingPayload, method: "qr" | "discovery") => {
      setConnectedHost(hostFromPayload(payload));
      const savedName = finalReceiverName("android");

      const request: JoinRequest = {
        deviceId,
        deviceName: savedName,
        method,
      };

      setStatus("waiting");
      setMessage("Asking desktop.");

      try {
        await startNativeReceiver(payload, request);
      } catch (error) {
        void logError("Native receiver start failed", error);
        setStatus("disconnected");
        setConnectedHost(null);
        setMessage("Native receiver failed.");
      }
    },
    [deviceId, finalReceiverName],
  );

  const findHosts = useCallback(async () => {
    setIsSearching(true);
    setMessage("Finding nearby hosts.");
    try {
      const hosts = await findNearbyHosts();
      setNearbyHosts(uniqueHosts(hosts));
      setMessage(hosts.length > 0 ? "Select a host." : "No host found.");
    } catch (error) {
      void logError("Find nearby hosts failed", error);
      setMessage("LAN discovery failed.");
    } finally {
      setIsSearching(false);
    }
  }, []);

  const reset = () => {
    void stopNativeReceiver();
    void stopAndroidMediaSession();
    setConnectedHost(null);
    setStatus("disconnected");
    setMessage("Scan or find a host.");
  };

  const isConnected = status === "connected" && connectedHost !== null;

  return (
    <MobileLayout>
      <header className="flex items-center gap-3 py-2">
        <EkoMark animated className="size-11" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">eko</h1>
          <p className="truncate text-sm text-muted-foreground">{message}</p>
        </div>
      </header>
      {isConnected ? (
        <ConnectionStatus connectedHost={connectedHost} onDisconnect={reset} status={status} />
      ) : (
        <>
          {status !== "disconnected" ? <ConnectionStatus status={status} /> : null}
          <label className="grid gap-2 text-sm font-medium" htmlFor="android-receiver-name">
            Receiver name
            <Input
              id="android-receiver-name"
              value={deviceName}
              onBlur={() => finalReceiverName("android")}
              onChange={(event) => setReceiverName("android", event.target.value)}
              maxLength={40}
              disabled={status === "waiting" || status === "connecting"}
            />
          </label>
        </>
      )}
      <ScanQrScreen
        compact={status !== "disconnected"}
        onScanned={(payload) => requestApproval(payload, "qr")}
      />
      {isConnected ? null : (
        <>
          <NearbyHostList
            hosts={nearbyHosts}
            isSearching={isSearching}
            onFind={findHosts}
            onSelect={(host) =>
              requestApproval(
                { version: 1, local: { host: host.host, port: host.port }, hosted: null },
                "discovery",
              )
            }
          />
          {status !== "disconnected" ? (
            <Button className="h-11" onClick={reset} variant="outline">
              Reset
            </Button>
          ) : null}
        </>
      )}
    </MobileLayout>
  );
}

export default App;

function hostFromPayload(payload: QrPairingPayload): ConnectedHost {
  return {
    name: "eko desktop",
    address: `${payload.local.host}:${payload.local.port}`,
  };
}

function uniqueHosts(hosts: DiscoveredHost[]): DiscoveredHost[] {
  const hostMap = new Map<string, DiscoveredHost>();

  for (const host of hosts) {
    hostMap.set(`${host.host}-${host.port}`, host);
  }

  return [...hostMap.values()];
}
