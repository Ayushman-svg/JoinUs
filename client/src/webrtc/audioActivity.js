/**
 * Audio activity detector for active speaker indication.
 * Uses Web Audio API AnalyserNode per stream, throttled to avoid CPU overhead.
 */
export class AudioActivityTracker {
  #audioContext = null;
  #sources = new Map(); // id -> { source, analyser, dataArray }
  #intervalId = null;
  #currentSpeaker = null;
  #onSpeakerChange = null;
  #threshold = 18; // Minimum average frequency energy (0-255) to qualify as speech

  constructor({ onSpeakerChange, threshold = 18 } = {}) {
    this.#onSpeakerChange = onSpeakerChange;
    this.#threshold = threshold;
  }

  #getAudioContext() {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!this.#audioContext) {
      try {
        this.#audioContext = new AudioContextClass();
      } catch {
        return null;
      }
    }
    if (this.#audioContext.state === 'suspended') {
      this.#audioContext.resume().catch(() => {});
    }
    return this.#audioContext;
  }

  trackStream(id, stream) {
    if (!id || !stream) return;
    const audioTracks = stream.getAudioTracks ? stream.getAudioTracks() : [];
    if (!audioTracks.length) {
      this.untrackStream(id);
      return;
    }

    const ctx = this.#getAudioContext();
    if (!ctx) return;

    // If already tracked with the same stream, don't recreate
    const existing = this.#sources.get(id);
    if (existing && existing.stream === stream) return;
    if (existing) this.untrackStream(id);

    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      this.#sources.set(id, { stream, source, analyser, dataArray });

      this.#startLoop();
    } catch {
      // Audio source creation may fail if track is inactive or restricted
    }
  }

  untrackStream(id) {
    const entry = this.#sources.get(id);
    if (!entry) return;
    try {
      entry.source.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    this.#sources.delete(id);

    if (this.#currentSpeaker === id) {
      this.#currentSpeaker = null;
      this.#onSpeakerChange?.(null);
    }

    if (this.#sources.size === 0) {
      this.#stopLoop();
    }
  }

  #startLoop() {
    if (this.#intervalId !== null) return;
    // Sample every 150ms per design spec
    this.#intervalId = setInterval(() => this.#sample(), 150);
  }

  #stopLoop() {
    if (this.#intervalId !== null) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
  }

  #sample() {
    let topSpeaker = null;
    let maxAvg = 0;

    for (const [id, entry] of this.#sources.entries()) {
      const { stream, analyser, dataArray } = entry;
      const audioTracks = stream.getAudioTracks ? stream.getAudioTracks() : [];
      const hasLiveAudio = audioTracks.some((t) => t.readyState === 'live' && t.enabled !== false);
      if (!hasLiveAudio) continue;

      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;

      if (avg > this.#threshold && avg > maxAvg) {
        maxAvg = avg;
        topSpeaker = id;
      }
    }

    if (topSpeaker !== this.#currentSpeaker) {
      this.#currentSpeaker = topSpeaker;
      this.#onSpeakerChange?.(topSpeaker);
    }
  }

  destroy() {
    this.#stopLoop();
    for (const [id] of this.#sources) {
      this.untrackStream(id);
    }
    this.#sources.clear();
    if (this.#audioContext && this.#audioContext.state !== 'closed') {
      try {
        this.#audioContext.close().catch(() => {});
      } catch {
        // ignore
      }
    }
    this.#audioContext = null;
    this.#currentSpeaker = null;
  }
}
