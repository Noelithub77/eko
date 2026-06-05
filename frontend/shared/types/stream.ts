import type { Device } from "./device";

export type StreamStatus = "idle" | "starting" | "running" | "stopping" | "failed";

export type QrPairingPayload = {
  host: string;
  port: number;
  roomId: string;
  token: string;
};

export type DevMetric = {
  id: string;
  label: string;
  value: number;
  unit: "ms" | "count";
  createdAt: string;
};

export type DevEvent = {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  createdAt: string;
};

export type RoomSession = {
  status: StreamStatus;
  roomId: string | null;
  token: string | null;
  host: string | null;
  port: number | null;
  lanDiscoveryEnabled: boolean;
  devices: Device[];
  metrics: DevMetric[];
  events: DevEvent[];
};

export type StartStreamResult = {
  session: RoomSession;
  qrPayload: QrPairingPayload;
};
