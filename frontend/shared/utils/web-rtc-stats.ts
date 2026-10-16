const loggedCandidatePaths = new WeakMap<RTCPeerConnection, WebConnectionPath>();
export type WebConnectionPath = "direct" | "relay";
export type StatsFields = Record<string, unknown>;

export function statsFields(stats: RTCStatsReport): StatsFields[] {
  const reports: StatsFields[] = [];
  stats.forEach((value: unknown) => {
    if (typeof value === "object" && value !== null) reports.push(Object.fromEntries(Object.entries(value)));
  });
  return reports;
}

export function selectedCandidatePair(reports: StatsFields[]): StatsFields | undefined {
  const transport = reports.find((report) => report.type === "transport" && typeof report.selectedCandidatePairId === "string");
  if (transport) return reports.find((report) => report.id === transport.selectedCandidatePairId);
  return reports.find((report) => report.type === "candidate-pair" && report.nominated === true && report.state === "succeeded");
}

export function connectionPath(reports: StatsFields[]): WebConnectionPath | null {
  const pair = selectedCandidatePair(reports);
  if (!pair) return null;
  const local = reports.find((report) => report.id === pair.localCandidateId);
  const remote = reports.find((report) => report.id === pair.remoteCandidateId);
  if (local?.candidateType === "relay" || remote?.candidateType === "relay") return "relay";
  return typeof local?.candidateType === "string" && typeof remote?.candidateType === "string" ? "direct" : null;
}

export function logAudioStats(peer: RTCPeerConnection, onConnectionPath?: (path: WebConnectionPath) => void): void {
  void peer.getStats().then((stats) => {
    const path = connectionPath(statsFields(stats));
    if (!path || loggedCandidatePaths.get(peer) === path) return;
    loggedCandidatePaths.set(peer, path);
    console.info(`[eko] selected media path: ${path}`);
    onConnectionPath?.(path);
  }).catch(() => undefined);
}
