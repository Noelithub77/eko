import { invoke } from "@tauri-apps/api/core";

export function greet(name: string): Promise<string> {
  return invoke<string>("greet", { name });
}
