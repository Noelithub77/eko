import type {
  AudioProofStatus,
  DiscoveryProofStatus,
  SignalingProofStatus,
  WebRtcProofStatus,
} from "../bindings/tauri";

export type {
  AudioProofStatus,
  CoreProofStatus,
  DiscoveryProofStatus,
  SignalingProofStatus,
  WebRtcProofStatus,
} from "../bindings/tauri";

export type ProofAreaStatus =
  | AudioProofStatus
  | DiscoveryProofStatus
  | SignalingProofStatus
  | WebRtcProofStatus;
