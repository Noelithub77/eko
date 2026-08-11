const loggedCandidatePaths = new WeakSet<RTCPeerConnection>();

export function logAudioStats(peer: RTCPeerConnection): void {
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
    logSelectedCandidate(peer, reports);
  });
}

function logSelectedCandidate(peer: RTCPeerConnection, reports: Record<string, unknown>[]): void {
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
  if (candidate.candidateType === "relay") {
    console.error("[eko] invalid relay candidate selected while TURN is disabled");
  } else {
    console.log(`[eko] selected ICE candidate: ${candidate.candidateType}`);
  }
}
