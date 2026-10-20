import { z } from "zod";
import { AudioHost } from "./runtime/host";
import { commandSchema, errorMessage } from "./runtime/messages";

const host = new AudioHost((state) => {
  void chrome.runtime.sendMessage({ target: "popup", state }).catch(() => {});
});
const requestSchema = z.object({ target: z.literal("offscreen"), command: commandSchema,
  capture: z.object({ streamId: z.string(), tabId: z.number(), tabTitle: z.string() }).optional() });
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((value, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) return;
  const { command, capture } = parsed.data;
  queue = queue.then(async () => {
    try {
      const state = command.type === "start" && capture
        ? await host.start(capture.streamId, capture.tabId, capture.tabTitle) : await host.command(command);
      reply({ ok: true, state });
    } catch (error) { reply({ ok: false, error: errorMessage(error) }); }
  });
  return true;
});
