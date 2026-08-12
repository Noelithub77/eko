import { describe, expect, it } from "vitest";
import { relayClientMessageSchema } from "../../relay/protocol";

describe("relay protocol", () => {
  it("accepts opaque Eko signaling payloads", () => {
    const result = relayClientMessageSchema.safeParse({
      type: "signal",
      deviceId: "phone-1",
      payload: { kind: "hostOffer", description: { deviceId: "phone-1", sdp: "offer" } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects messages with extra fields", () => {
    const result = relayClientMessageSchema.safeParse({
      type: "hello",
      role: "receiver",
      token: "a".repeat(64),
      deviceId: "phone-1",
      unexpected: true,
    });
    expect(result.success).toBe(false);
  });
});
