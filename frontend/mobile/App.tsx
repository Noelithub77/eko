import { useCallback, useMemo, useState } from "react";
import { MobileLayout } from "./layouts/MobileLayout";
import { Button } from "@shared/components/ui/button";
import { submitJoinRequest } from "@shared/utils/api";
import type { JoinRequest } from "@shared/types/device";
import type { QrPairingPayload } from "@shared/types/stream";
import { ConnectionStatus } from "./features/approval/ConnectionStatus";
import { NearbyHostList } from "./features/discovery/NearbyHostList";
import { ScanQrScreen } from "./features/pairing/ScanQrScreen";
import "./App.css";

function App() {
  const [status, setStatus] = useState<"disconnected" | "waiting" | "connected" | "denied">(
    "disconnected",
  );
  const [message, setMessage] = useState("Scan or find a host.");

  const deviceId = useMemo(() => crypto.randomUUID(), []);

  const requestApproval = useCallback(
    async (payload: QrPairingPayload) => {
      const request: JoinRequest = {
        deviceId,
        deviceName: navigator.userAgent.includes("Android") ? "Android phone" : "Mobile device",
        method: "qr",
        roomId: payload.roomId,
        token: payload.token,
      };

      setStatus("waiting");
      setMessage("Waiting for desktop.");

      try {
        await submitJoinRequest(request);
      } catch {
        setStatus("denied");
        setMessage("Request failed.");
      }
    },
    [deviceId],
  );

  return (
    <MobileLayout>
      <div>
        <h1 className="text-xl font-semibold">Eko</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      <ScanQrScreen onScanned={requestApproval} />
      <NearbyHostList onFind={() => setMessage("LAN discovery core is next.")} />
      <ConnectionStatus status={status} />
      <Button onClick={() => setStatus("disconnected")} variant="outline">
        Reset
      </Button>
    </MobileLayout>
  );
}

export default App;
