import { useCallback, useEffect, useState } from "react";
import { errorMessage, initialSnapshot, replySchema, updateSchema, type HostCommand } from "../runtime/messages";

export function useHost() {
  const [state, setState] = useState(initialSnapshot);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabTitle, setTabTitle] = useState("Current tab");
  const run = useCallback(async (command: HostCommand) => {
    setPending(true);
    setError(null);
    try {
      if (typeof chrome === "undefined") throw new Error("Load the built extension in Chrome to share audio.");
      const reply = replySchema.parse(await chrome.runtime.sendMessage({ target: "background", command }));
      if (!reply.ok) throw new Error(reply.error);
      setState(reply.state);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally { setPending(false); }
  }, []);
  useEffect(() => {
    void run({ type: "getState" });
    if (typeof chrome === "undefined") return;
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => setTabTitle(tab?.title ?? "Current tab"));
    const listener: ChromeListener = (message) => {
      const update = updateSchema.safeParse(message);
      if (update.success) setState(update.data.state);
      return undefined;
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [run]);
  return { state, pending, error: error ?? state.error, tabTitle, run };
}
