import { z } from "zod";
import { commandSchema, errorMessage, replySchema } from "./runtime/messages";

let creating: Promise<void> | null = null;
async function ensureOffscreen(): Promise<void> {
  if (creating) return creating;
  const create = async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
    if (contexts.length) return;
    await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
      justification: "Capture tab audio and stream it to approved eko listeners." });
  };
  creating = create();
  try { await creating; } finally { creating = null; }
}
const requestSchema = z.object({ target: z.literal("background"), command: commandSchema });
chrome.runtime.onMessage.addListener((value, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) return;
  const handle = async () => {
    await ensureOffscreen();
    const { command } = parsed.data;
    let capture: { streamId: string; tabId: number; tabTitle: string } | undefined;
    if (command.type === "start") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined || !tab.url?.match(/^https?:\/\//u)) throw new Error("Open a web page with audio, then try again.");
      capture = { streamId: await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }),
        tabId: tab.id, tabTitle: tab.title ?? "Current tab" };
    }
    return replySchema.parse(await chrome.runtime.sendMessage({ target: "offscreen", command, capture }));
  };
  void handle().then(reply).catch((error: unknown) => reply({ ok: false, error: errorMessage(error) }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.runtime.sendMessage({ target: "offscreen", command: { type: "getState" } }).then(async (value) => {
    const reply = replySchema.safeParse(value);
    if (reply.success && reply.data.ok && reply.data.state.tabId === tabId) {
      await chrome.runtime.sendMessage({ target: "offscreen", command: { type: "stop" } });
    }
  }).catch(() => {});
});
