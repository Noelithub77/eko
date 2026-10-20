import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Headphones } from "lucide-react";
import { ReceiverLayout } from "@shared/components/receiver/ReceiverLayout";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { parsePairingSource } from "@shared/utils/pairing-link";
import { createPairingLink } from "@shared/utils/pairing-link";
import { AppErrorBoundary } from "@shared/components/AppErrorBoundary";
import "../frontend/web/client/index.css";

function Receiver() {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  return <ReceiverLayout label="Listen"><form className="grid gap-4" onSubmit={(event) => {
    event.preventDefault();
    const payload = parsePairingSource(link);
    if (!payload?.hosted || new URL(payload.hosted.clientUrl).origin !== "https://eko.allpyq.in") {
      setError("Enter an eko pairing link.");
      return;
    }
    // Use the existing hosted receiver, which keeps playing when the popup closes.
    location.assign(createPairingLink(payload));
  }}>
    <label htmlFor="pairing-link" className="text-sm font-medium">Pairing link</label>
    <Input id="pairing-link" type="url" required value={link} onChange={(event) => setLink(event.target.value)} placeholder="Paste the host’s link" />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit"><Headphones />Listen</Button>
  </form></ReceiverLayout>;
}
document.documentElement.classList.toggle("dark", localStorage.getItem("eko-extension-theme") === "dark");
const root = document.getElementById("root");
if (root) createRoot(root).render(<AppErrorBoundary><Receiver /></AppErrorBoundary>);
