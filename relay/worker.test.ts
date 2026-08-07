import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Eko relay Worker", () => {
  it("reports health", async () => {
    const response = await SELF.fetch("https://relay.test/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: "eko-relay" });
  });

  it("creates a protected room", async () => {
    const response = await SELF.fetch("https://relay.test/v1/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(200);
    const room = await response.json<{
      roomId: string;
      hostToken: string;
      joinToken: string;
      socketUrl: string;
      clientUrl: string;
    }>();
    expect(room.roomId).toMatch(/^[0-9a-f-]{36}$/);
    expect(room.hostToken).toHaveLength(64);
    expect(room.joinToken).toHaveLength(64);
    expect(room.socketUrl).toContain(`/v1/rooms/${room.roomId}/socket`);
    expect(room.clientUrl).toBe("https://relay.test/client");
  });
});
