import { HostSession } from "../../extension/runtime/session";
import { HostPeers } from "../../extension/runtime/peers";
import type { SignalServerMessage } from "../../frontend/shared/bindings/tauri";

async function verify() {
  document.body.dataset.peerTest = "starting";
  const session = new HostSession("room", "token");
  const audio = new AudioContext();
  const output = audio.createMediaStreamDestination();
  const oscillator = audio.createOscillator();
  oscillator.connect(output);
  oscillator.start();
  const sent: SignalServerMessage[] = [];
  const peers = new HostPeers(session, output.stream, () => [], (_deviceId, message) => sent.push(message), () => {});
  const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
  try {
    await peers.ready("unknown");
    session.request({ deviceId: "phone", deviceName: "Phone", method: "qr" });
    await peers.ready("phone");
    check(sent.length === 0, "Unapproved listener received signaling");
    session.allow("phone");
    document.body.dataset.peerTest = "creating offer";
    await Promise.all([peers.ready("phone"), peers.ready("phone")]);
    const offers = sent.filter((message) => message.kind === "hostOffer");
    document.body.dataset.peerTest = "checking offer";
    check(offers.length === 1, "Duplicate ready replaced a peer");
    const offer = offers[0];
    check(offer?.kind === "hostOffer" && offer.description.sdp.includes("opus/48000"), "No Opus offer");
    check(offer?.kind === "hostOffer" && offer.description.sdp.includes("a=sendonly"), "Host should only send audio");
    session.deny("phone"); peers.close("phone");
    const count = sent.length;
    await peers.ready("phone");
    check(sent.length === count, "Denied listener restarted media");
    session.unblock("phone");
    session.request({ deviceId: "phone", deviceName: "Phone", method: "qr" });
    session.allow("phone");
    const pending = peers.ready("phone");
    session.deny("phone"); peers.close("phone");
    await pending;
    check(sent.length === count, "Revoked listener received an in-flight offer");
  } finally {
    peers.closeAll(); oscillator.stop();
    for (const track of output.stream.getTracks()) track.stop();
    await audio.close();
  }
}
void verify().then(() => { document.body.dataset.peerTest = "passed"; }).catch((error: unknown) => {
  document.body.dataset.peerTest = error instanceof Error ? error.message : "failed";
});
