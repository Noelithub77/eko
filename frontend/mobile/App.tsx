import { useCallback, useMemo, useRef, useState } from "react";
import { MobileLayout } from "./layouts/MobileLayout";
import { Button } from "@shared/components/ui/button";
import { findNearbyHosts } from "@shared/utils/api";
import type { JoinRequest } from "@shared/types/device";
import type { DiscoveredHost, SignalServerMessage } from "@shared/types/signaling";
import type { QrPairingPayload } from "@shared/types/stream";
import { connectToHost, type SignalClient } from "@shared/utils/signaling-client";
import { ConnectionStatus } from "./features/approval/ConnectionStatus";
import { NearbyHostList } from "./features/discovery/NearbyHostList";
import { ScanQrScreen } from "./features/pairing/ScanQrScreen";
import "./App.css";

function App() {
  const [status, setStatus] = useState<
    "disconnected" | "waiting" | "connecting" | "connected" | "denied"
  >("disconnected");
  const [message, setMessage] = useState("Scan or find a host.");
  const [nearbyHosts, setNearbyHosts] = useState<DiscoveredHost[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const clientRef = useRef<SignalClient | null>(null);

  const deviceId = useMemo(() => getDeviceId(), []);

  const handleHostMessage = useCallback(
    (signalClient: SignalClient, signal: SignalServerMessage) => {
      if (signal.kind === "approvalWaiting") {
        setStatus("waiting");
        setMessage("Waiting for desktop approval.");
        return;
      }
      if (signal.kind === "joinRejected") {
        setStatus("denied");
        setMessage(signal.reason);
        return;
      }
      if (signal.kind === "permissionChanged") {
        if (signal.state === "denied") {
          setStatus("denied");
          setMessage("Desktop denied this device.");
        } else if (signal.state === "connecting") {
          setStatus("connecting");
          setMessage("Connecting audio.");
          signalClient.sendReceiverReady(signal.deviceId);
        } else if (signal.state === "connected") {
          setStatus("connected");
          setMessage("Connected.");
        }
        return;
      }
      if (signal.kind === "error") {
        setMessage(signal.message);
      }
    },
    [],
  );

  const requestApproval = useCallback(
    (payload: QrPairingPayload, method: "qr" | "discovery") => {
      clientRef.current?.close();
      const request: JoinRequest = {
        deviceId,
        deviceName: navigator.userAgent.includes("Android") ? "Android phone" : "Mobile device",
        method,
        roomId: payload.roomId,
        token: payload.token,
      };

      setStatus("waiting");
      setMessage("Asking desktop.");

      const client = connectToHost(payload, request, {
        onMessage: (signal) => handleHostMessage(client, signal),
        onError: (errorMessage) => {
          setStatus("disconnected");
          setMessage(errorMessage);
        },
        onClosed: () => {
          if (status !== "connected") {
            setStatus("disconnected");
          }
        },
      });
      clientRef.current = client;
    },
    [deviceId, handleHostMessage, status],
  );

  const findHosts = useCallback(async () => {
    setIsSearching(true);
    setMessage("Finding nearby hosts.");
    try {
      const hosts = await findNearbyHosts();
      setNearbyHosts(hosts);
      setMessage(hosts.length > 0 ? "Select a host." : "No host found.");
    } catch {
      setMessage("LAN discovery failed.");
    } finally {
      setIsSearching(false);
    }
  }, []);

  return (
    <MobileLayout>
      <div>
        <h1 className="text-xl font-semibold">Eko</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      <ScanQrScreen onScanned={(payload) => requestApproval(payload, "qr")} />
      <NearbyHostList
        hosts={nearbyHosts}
        isSearching={isSearching}
        onFind={findHosts}
        onSelect={(host) => requestApproval(host, "discovery")}
      />
      <ConnectionStatus status={status} />
      <Button
        onClick={() => {
          clientRef.current?.close();
          clientRef.current = null;
          setStatus("disconnected");
          setMessage("Scan or find a host.");
        }}
        variant="outline"
      >
        Reset
      </Button>
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
