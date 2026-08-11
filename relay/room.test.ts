import { env, runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hashSecret } from "./room";

describe("Eko room", () => {
  it("authenticates and routes opaque messages", async () => {
    const roomId = crypto.randomUUID();
    const hostToken = "h".repeat(64);
    const joinToken = "j".repeat(64);
    const room = env.ROOM.getByName(roomId);
    await room.initialize(roomId, await hashSecret(hostToken), await hashSecret(joinToken));

    const host = await openSocket(room);
    const receiver = await openSocket(room);
    host.send(JSON.stringify({ type: "hello", role: "host", token: hostToken }));
    receiver.send(
      JSON.stringify({ type: "hello", role: "receiver", token: joinToken, deviceId: "phone-1" }),
    );
    await expect(nextMessage(host)).resolves.toMatchObject({ type: "ready", role: "host" });
    await expect(nextMessage(receiver)).resolves.toMatchObject({ type: "ready", role: "receiver" });

    receiver.send(JSON.stringify({ type: "signal", payload: { kind: "answer", sdp: "test" } }));
    await expect(nextMessage(host)).resolves.toEqual({
      type: "signal",
      deviceId: "phone-1",
      payload: { kind: "answer", sdp: "test" },
    });
  });

  it("closes an abandoned room when its alarm runs", async () => {
    const roomId = crypto.randomUUID();
    const room = env.ROOM.getByName(roomId);
    await room.initialize(
      roomId,
      await hashSecret("h".repeat(64)),
      await hashSecret("j".repeat(64)),
    );
    await expect(runDurableObjectAlarm(room)).resolves.toBe(true);
    const response = await room.fetch("https://relay.test/socket", {
      headers: { Upgrade: "websocket" },
    });
    expect(response.status).toBe(404);
  });
});

async function openSocket(room: DurableObjectStub<import("./room").Room>): Promise<WebSocket> {
  const response = await room.fetch("https://relay.test/socket", {
    headers: { Upgrade: "websocket" },
  });
  const socket = response.webSocket;
  if (!socket) {
    throw new Error("Room did not return a WebSocket");
  }
  socket.accept();
  return socket;
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for relay message")),
      2_000,
    );
    socket.addEventListener(
      "message",
      (event) => {
        clearTimeout(timeout);
        try {
          resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
        } catch (error) {
          reject(error);
        }
      },
      { once: true },
    );
  });
}
