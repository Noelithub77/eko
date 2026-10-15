// Loaded on demand: React only powers Sonner's toasts.
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { builds, type Platform } from "./platform.ts";

function Mark() {
  return <img src="/eko.svg" alt="" width={20} height={20} />;
}

const host = document.createElement("div");
document.body.append(host);
createRoot(host).render(
  <Toaster
    theme="dark"
    position="bottom-center"
    offset={24}
    mobileOffset={16}
    gap={10}
    visibleToasts={3}
    style={{ fontFamily: "inherit" }}
    toastOptions={{ className: "eko-toast" }}
  />,
);

const next: Record<Platform, string> = {
  windows: "Run the installer, start eko, then scan its QR code with your phone.",
  linux: `Make it executable with chmod +x ${builds.linux.file}, then run it.`,
  android: "Allow installs from your browser, open eko, and scan the laptop's QR code.",
};

const names: Record<Platform, string> = { windows: "Windows", linux: "Linux", android: "Android" };

export function downloading(platform: Platform) {
  toast(`Downloading eko for ${names[platform]}`, { id: "download", icon: <Mark />, description: next[platform] });
}

export function echoed(count: number) {
  toast("echo… echo… echo…", {
    id: "echo",
    icon: <Mark />,
    description: count > 1 ? `You found it ${count} times. It keeps coming back.` : "Every sound comes back somewhere. Type it again.",
  });
}
