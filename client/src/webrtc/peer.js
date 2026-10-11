// One RTCPeerConnection to one remote participant, using the "perfect negotiation" pattern
// (https://w3c.github.io/webrtc-pc/#perfect-negotiation-example). Plain JavaScript, no React.
//
// Both sides may start an offer at the same time ("glare"). The roles resolve it:
//   polite   - gives up its own offer (rollback) and accepts the other side's
//   impolite - ignores the other side's colliding offer and keeps its own
// The two peers must get opposite roles, so the caller derives them from the peer ids.
//
// To avoid glare in the first place, only the "initiator" (the side that joined last) starts the
// first negotiation. The other side waits for that offer instead of sending its own, which
// also keeps the normal case away from the rollback path.

export const DEFAULT_RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const MAX_ICE_RESTARTS = 2;

const toDescription = ({ type, sdp }) => ({ type, sdp });

export class Peer {
  // sendSignal({ description } | { candidate }) delivers a message to the remote peer.
  constructor({
    remoteId,
    polite,
    initiator = true,
    localStream = null,
    rtcConfig = DEFAULT_RTC_CONFIG,
    sendSignal,
    onRemoteStream,
    onConnectionState,
    onError,
  }) {
    this.remoteId = remoteId;
    this.polite = polite;
    this.initiator = initiator;
    this.sendSignal = sendSignal;
    this.onRemoteStream = onRemoteStream;
    this.onConnectionState = onConnectionState;
    this.onError = onError;

    this.pc = new RTCPeerConnection(rtcConfig);
    this.remoteStream = null;
    this.closed = false;

    this.makingOffer = false;
    this.ignoreOffer = false;
    this.settingRemoteAnswer = false;
    this.iceRestarts = 0;
    this.queue = Promise.resolve();

    this.#bind();
    this.#addLocalMedia(localStream);
  }

  get connectionState() {
    return this.pc.connectionState;
  }

  #bind() {
    const { pc } = this;

    // Fires when tracks are added and when ICE restarts: the one place that creates offers
    pc.onnegotiationneeded = async () => {
      // Not the initiator: the first offer comes from the other side (it answers our tracks too)
      if (!this.initiator && !pc.remoteDescription) return;
      try {
        this.makingOffer = true;
        await pc.setLocalDescription(); // picks the right offer or answer by itself
        this.#send({ description: toDescription(pc.localDescription) });
      } catch (err) {
        this.#report('NEGOTIATION_FAILED', err);
      } finally {
        this.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.#send({ candidate: candidate.toJSON() }); // null marks the end, not sent
    };

    pc.ontrack = ({ track, streams }) => {
      if (!this.remoteStream) this.remoteStream = streams[0] ?? new MediaStream();
      if (!this.remoteStream.getTracks().includes(track)) this.remoteStream.addTrack(track);
      this.onRemoteStream?.(this.remoteStream);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.onConnectionState?.(state);
      if (state === 'connected') this.iceRestarts = 0;
      // The path broke: try new ICE candidates a couple of times before giving up
      if (state === 'failed' && this.iceRestarts < MAX_ICE_RESTARTS) {
        this.iceRestarts += 1;
        pc.restartIce();
      }
    };
  }

  #addLocalMedia(stream) {
    const kinds = new Set();
    stream?.getTracks().forEach((track) => {
      this.pc.addTrack(track, stream);
      kinds.add(track.kind);
    });
    // A missing camera or microphone must not stop us from receiving the other side's
    for (const kind of ['audio', 'video']) {
      if (!kinds.has(kind)) this.pc.addTransceiver(kind, { direction: 'recvonly' });
    }
  }

  // Feed every { description } or { candidate } received from the remote peer into here.
  // Messages are handled one at a time in arrival order. Otherwise a candidate could be applied
  // while the offer it belongs to is still being set up (handling an offer awaits), and a
  // candidate that arrives too early is lost, so ICE never starts.
  handleSignal(message) {
    this.queue = this.queue.then(() => this.#processSignal(message));
    return this.queue;
  }

  async #processSignal({ description, candidate }) {
    const { pc } = this;
    if (this.closed) return;

    try {
      if (description) {
        const readyForOffer =
          !this.makingOffer && (pc.signalingState === 'stable' || this.settingRemoteAnswer);
        const collision = description.type === 'offer' && !readyForOffer;

        this.ignoreOffer = !this.polite && collision;
        if (this.ignoreOffer) return;

        this.settingRemoteAnswer = description.type === 'answer';
        // The polite side drops its own pending offer first. (When our offer is still being
        // created the signaling state is "stable", and setRemoteDescription rolls it back itself.)
        if (collision && pc.signalingState !== 'stable') {
          await pc.setLocalDescription({ type: 'rollback' });
        }
        await pc.setRemoteDescription(description);
        this.settingRemoteAnswer = false;

        if (description.type === 'offer') {
          await pc.setLocalDescription();
          this.#send({ description: toDescription(pc.localDescription) });
        }
      } else if (candidate) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          if (!this.ignoreOffer) throw err; // candidates of an ignored offer are expected to fail
        }
      }
    } catch (err) {
      this.#report('SIGNAL_FAILED', err);
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    const { pc } = this;
    pc.onnegotiationneeded = null;
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
  }

  #send(message) {
    if (this.closed) return;
    Promise.resolve(this.sendSignal(message)).catch((err) => this.#report('SEND_FAILED', err));
  }

  #report(code, err) {
    if (this.closed) return;
    this.onError?.({ code, message: err?.message ?? String(err), cause: err });
  }
}
