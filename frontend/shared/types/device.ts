export type JoinMethod = "qr" | "discovery";

export type DeviceConnectionState =
  | "pending"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "denied";

export type SharingState = "enabled" | "disabled";

export type Device = {
  deviceId: string;
  deviceName: string;
  label: string | null;
  state: DeviceConnectionState;
  joinMethod: JoinMethod;
  sharing: SharingState;
  connectedAt: string | null;
  webRtcState: string;
  iceState: string;
};

export type JoinRequest = {
  deviceId: string;
  deviceName: string;
  roomId: string;
  method: JoinMethod;
  token: string;
};

export type ApprovalDecision = "allow" | "deny";
