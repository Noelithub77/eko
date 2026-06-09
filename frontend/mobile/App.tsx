import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileLayout } from "./layouts/MobileLayout";
import { Button } from "@shared/components/ui/button";
import { findNearbyHosts, startNativeReceiver, stopNativeReceiver } from "@shared/utils/api";
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
  const [latencyMs] = useState<number | null>(null);

  const deviceId = useMemo(() => getDeviceId(), []);

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
        return;
      }
      if (event.payload.kind === "denied") {
        setStatus("denied");
        setMessage(event.payload.message);
        return;
      }
      if (event.payload.kind === "error" || event.payload.kind === "closed") {
        setStatus("disconnected");
        setMessage(event.payload.message);
      }
    });

    return () => {
      void unlisten.then((stopListening) => stopListening());
    };
  }, []);

  const requestApproval = useCallback(
    async (payload: QrPairingPayload, method: "qr" | "discovery") => {
      setConnectedHost(hostFromPayload(payload));

      const request: JoinRequest = {
        deviceId,
        deviceName: navigator.userAgent.includes("Android") ? "Android phone" : "Mobile device",
        method,
        roomId: payload.roomId,
        token: payload.token,
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
    [deviceId],
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

  return (
    <MobileLayout>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold leading-tight">Eko</h1>
        <p className="text-sm leading-5 text-muted-foreground">{message}</p>
      </div>
      <ScanQrScreen
        compact={status !== "disconnected"}
        onScanned={(payload) => requestApproval(payload, "qr")}
      />
      {status === "connected" && connectedHost ? (
        <ConnectionStatus
          connectedHost={connectedHost}
          latencyMs={latencyMs}
          onDisconnect={() => {
            void stopNativeReceiver();
            setConnectedHost(null);
            setStatus("disconnected");
            setMessage("Scan or find a host.");
          }}
          status={status}
        />
      ) : (
        <>
          <NearbyHostList
            hosts={nearbyHosts}
            isSearching={isSearching}
            onFind={findHosts}
            onSelect={(host) => requestApproval(host, "discovery")}
          />
          <ConnectionStatus status={status} />
          <Button
            onClick={() => {
              void stopNativeReceiver();
              setConnectedHost(null);
              setStatus("disconnected");
              setMessage("Scan or find a host.");
            }}
            variant="outline"
          >
            Reset
          </Button>
        </>
      )}
    </MobileLayout>
  );
}

export default App;

function getDeviceId(): string {
  const key = "eko-device-id";
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

function hostFromPayload(payload: QrPairingPayload): ConnectedHost {
  return {
    name: "Eko Desktop",
    address: `${payload.host}:${payload.port}`,
  };
}

function uniqueHosts(hosts: DiscoveredHost[]): DiscoveredHost[] {
  const hostMap = new Map<string, DiscoveredHost>();

  for (const host of hosts) {
    hostMap.set(`${host.roomId}-${host.host}-${host.port}`, host);
  }

  return [...hostMap.values()];
}
