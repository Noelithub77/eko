const TURN_CREDENTIAL_TTL_SECONDS = 3_600;
const TURN_CREDENTIAL_ENDPOINT =
  "https://rtc.live.cloudflare.com/v1/turn/keys/{keyId}/credentials/generate-ice-servers";

export type TurnIceServer = {
  urls: string[];
  username: string;
  credential: string;
};

export async function generateTurnCredentials(env: Env): Promise<TurnIceServer[]> {
  const endpoint = TURN_CREDENTIAL_ENDPOINT.replace("{keyId}", env.TURN_KEY_ID);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.TURN_KEY_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_SECONDS }),
  });

  if (!response.ok) {
    throw new Error(`Cloudflare TURN credentials failed with status ${response.status}`);
  }

  const body: unknown = await response.json();
  const iceServers = parseTurnResponse(body);
  if (iceServers.length === 0) {
    throw new Error("Cloudflare TURN returned no ICE servers");
  }
  return iceServers;
}

function parseTurnResponse(value: unknown): TurnIceServer[] {
  if (!isRecord(value) || !Array.isArray(value.iceServers)) {
    return [];
  }

  return value.iceServers.flatMap((entry: unknown) => {
    if (!isRecord(entry)) {
      return [];
    }
    const urls = normalizeUrls(entry.urls).filter((url) => !isPort53(url));
    if (urls.length === 0) {
      return [];
    }
    const username = typeof entry.username === "string" ? entry.username : "";
    const credential = typeof entry.credential === "string" ? entry.credential : "";
    return [{ urls, username, credential } satisfies TurnIceServer];
  });
}

function normalizeUrls(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  return Array.isArray(value) ? value.filter((url): url is string => typeof url === "string") : [];
}

function isPort53(url: string): boolean {
  return /:53(?:$|[?])/u.test(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
