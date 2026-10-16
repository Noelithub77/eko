type Shortcut = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat"> & { editable: boolean };

export function isDownloadShortcut(event: Shortcut): boolean {
  return event.key.toLowerCase() === "d"
    && (event.ctrlKey || event.metaKey)
    && !event.altKey && !event.shiftKey && !event.repeat && !event.editable;
}
