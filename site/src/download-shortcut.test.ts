import assert from "node:assert/strict";
import test from "node:test";
import { isDownloadShortcut } from "./download-shortcut.ts";

const shortcut = { key: "d", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false, editable: false };

test("downloads with Ctrl+D or Command+D", () => {
  assert.equal(isDownloadShortcut(shortcut), true);
  assert.equal(isDownloadShortcut({ ...shortcut, ctrlKey: false, metaKey: true, key: "D" }), true);
});

test("ignores typing, held keys, and other shortcuts", () => {
  for (const change of [{ editable: true }, { repeat: true }, { altKey: true }, { shiftKey: true }, { ctrlKey: false }, { key: "c" }]) {
    assert.equal(isDownloadShortcut({ ...shortcut, ...change }), false);
  }
});
