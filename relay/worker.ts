import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createRoomSchema, roomIdSchema } from "./protocol";
import { hashSecret, Room } from "./room";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (context) => context.json({ ok: true, service: "eko-relay" }));

app.post("/v1/rooms", zValidator("json", createRoomSchema), async (context) => {
  const clientIp = context.req.header("cf-connecting-ip") ?? "unknown";
  const rate = await context.env.ROOM_CREATE_LIMIT.limit({ key: clientIp });
  if (!rate.success) {
    return context.json({ error: "Too many room requests" }, 429);
  }

  const roomId = crypto.randomUUID();
  const hostToken = createSecret();
  const joinToken = createSecret();
  const room = context.env.ROOM.getByName(roomId);
  await room.initialize(roomId, await hashSecret(hostToken), await hashSecret(joinToken));

  const origin = new URL(context.req.url).origin;
  const socketOrigin = origin.replace(/^http/, "ws");
  return context.json({
    roomId,
    hostToken,
    joinToken,
    socketUrl: `${socketOrigin}/v1/rooms/${roomId}/socket`,
    clientUrl: `${origin}/client`,
  });
});

app.get("/v1/rooms/:roomId/socket", async (context) => {
  const parsed = roomIdSchema.safeParse(context.req.param("roomId"));
  if (!parsed.success) {
    return context.json({ error: "Invalid room" }, 400);
  }
  const headers = new Headers(context.req.raw.headers);
  headers.set("x-eko-client-ip", context.req.header("cf-connecting-ip") ?? "unknown");
  return context.env.ROOM.getByName(parsed.data).fetch(new Request(context.req.raw, { headers }));
});

app.notFound((context) => context.env.ASSETS.fetch(context.req.raw));

export { Room };
export default app;

function createSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
