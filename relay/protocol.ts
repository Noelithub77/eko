import { z } from "zod";

export const roomIdSchema = z.string().uuid();
export const secretSchema = z.string().min(32).max(128);
export const deviceIdSchema = z.string().trim().min(1).max(128);

const hostHelloSchema = z
  .object({
    type: z.literal("hello"),
    role: z.literal("host"),
    token: secretSchema,
  })
  .strict();

const receiverHelloSchema = z
  .object({
    type: z.literal("hello"),
    role: z.literal("receiver"),
    token: secretSchema,
    deviceId: deviceIdSchema,
  })
  .strict();

const receiverSignalSchema = z
  .object({
    type: z.literal("signal"),
    payload: z.unknown(),
  })
  .strict();

const hostSignalSchema = z
  .object({
    type: z.literal("signal"),
    deviceId: deviceIdSchema,
    payload: z.unknown(),
  })
  .strict();

export const relayClientMessageSchema = z.union([
  hostHelloSchema,
  receiverHelloSchema,
  receiverSignalSchema,
  hostSignalSchema,
  z.object({ type: z.literal("closeRoom") }).strict(),
]);

export const relayServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), role: z.enum(["host", "receiver"]) }).strict(),
  z.object({ type: z.literal("signal"), deviceId: deviceIdSchema, payload: z.unknown() }).strict(),
  z.object({ type: z.literal("hostReconnecting") }).strict(),
  z.object({ type: z.literal("hostConnected") }).strict(),
  z.object({ type: z.literal("peerLeft"), deviceId: deviceIdSchema }).strict(),
  z.object({ type: z.literal("roomClosed") }).strict(),
  z.object({ type: z.literal("error"), message: z.string().min(1).max(200) }).strict(),
]);

export const createRoomSchema = z.object({}).strict();

export const hostedRoomSchema = z
  .object({
    roomId: roomIdSchema,
    hostToken: secretSchema,
    joinToken: secretSchema,
    socketUrl: z.string().url(),
    clientUrl: z.string().url(),
  })
  .strict();

export type RelayClientMessage = z.infer<typeof relayClientMessageSchema>;
export type RelayServerMessage = z.infer<typeof relayServerMessageSchema>;
export type HostedRoom = z.infer<typeof hostedRoomSchema>;
