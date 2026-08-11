export type PairingLinkPayload = {
  version: number;
  local: {
    host: string;
    port: number;
  };
  hosted: {
    roomId: string;
    joinToken: string;
    socketUrl: string;
    clientUrl: string;
  } | null;
};
