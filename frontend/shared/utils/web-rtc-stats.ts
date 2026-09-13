const loggedCandidatePaths = new WeakSet<RTCPeerConnection>();

export type WebConnectionPath = "direct" | "relay";

export function logAudioStats(
  peer: RTCPeerConnection,
  onConnectionPath?: (path: WebConnectionPath) => void,
): void {
  void peer.getStats().then((stats) => {
    let audioBytes = 0;
    let audioPackets = 0;
    const reports: Record<string, unknown>[] = [];
    stats.forEach((raw) => {
      const report = raw as Record<string, unknown>;
      reports.push(report);
      if (report.type === "inbound-rtp" && report.kind === "audio") {
        audioBytes += typeof report.bytesReceived === "number" ? report.bytesReceived : 0;
        audioPackets += typeof report.packetsReceived === "number" ? report.packetsReceived : 0;
      }
    });
    if (audioBytes > 0 || audioPackets > 0) {
      console.log(`[eko] inbound audio: packets=${audioPackets} bytes=${audioBytes}`);
    }
    logSelectedCandidate(peer, reports, onConnectionPath);
  });
}

function logSelectedCandidate(
  peer: RTCPeerConnection,
  reports: Record<string, unknown>[],
  onConnectionPath?: (path: WebConnectionPath) => void,
): void {
  if (loggedCandidatePaths.has(peer)) {
    return;
  }
  const pair = reports.find(
    (report) => report.type === "candidate-pair" && report.nominated === true,
  );
  const localCandidateId = pair?.localCandidateId;
  if (typeof localCandidateId !== "string") {
    return;
  }
  const candidate = reports.find(
    (report) => report.type === "local-candidate" && report.id === localCandidateId,
  );
  if (typeof candidate?.candidateType !== "string") {
    return;
  }
  loggedCandidatePaths.add(peer);
  const path: WebConnectionPath = candidate.candidateType === "relay" ? "relay" : "direct";
  if (path === "relay") {
    console.warn("[eko] selected ICE relay candidate");
  } else {
    console.log(`[eko] selected ICE candidate: ${candidate.candidateType}`);
  }
  onConnectionPath?.(path);
}
