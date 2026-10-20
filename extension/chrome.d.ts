type ChromeTab = { id?: number; title?: string; url?: string };
type ChromeSender = { id?: string; url?: string };
type ChromeListener = (message: unknown, sender: ChromeSender, reply: (response: unknown) => void) => boolean | undefined;

declare const chrome: {
  runtime: {
    id: string;
    getURL(path: string): string;
    getContexts(filter: { contextTypes: string[]; documentUrls?: string[] }): Promise<{ documentUrl: string }[]>;
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: { addListener(listener: ChromeListener): void; removeListener(listener: ChromeListener): void };
  };
  offscreen: {
    createDocument(options: { url: string; reasons: string[]; justification: string }): Promise<void>;
  };
  tabs: {
    query(query: { active: boolean; currentWindow: boolean }): Promise<ChromeTab[]>;
    create(options: { url: string }): Promise<ChromeTab>;
    onRemoved: { addListener(listener: (tabId: number) => void): void };
  };
  tabCapture: { getMediaStreamId(options: { targetTabId: number }): Promise<string> };
  action: {
    setBadgeText(options: { text: string }): Promise<void>;
    setBadgeBackgroundColor(options: { color: string }): Promise<void>;
  };
};
