export type ProofAreaStatus = {
  libraryReady?: boolean;
  captureReady?: boolean;
  backend?: string;
  defaultOutputDevice?: string | null;
  serviceType?: string;
  transport?: string;
  mediaTransport?: string;
  codec?: string;
  note: string;
};

export type CoreProofStatus = {
  audio: ProofAreaStatus;
  discovery: ProofAreaStatus;
  signaling: ProofAreaStatus;
  webRtc: ProofAreaStatus;
};
