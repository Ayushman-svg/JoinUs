// Web Speech API helper and manager for live transcription
// Note: Supported primarily in Chromium browsers (Google Chrome, Microsoft Edge).

export const CAPTIONS_DISCLAIMER =
  "Live captions use your browser's Web Speech API. When enabled, your microphone audio is sent to your browser vendor's cloud speech recognition service (such as Google or Microsoft) for transcription. JoinUs does not store or process your raw audio.";

export function isSpeechRecognitionSupported() {
  const scope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (!scope) return false;
  return Boolean(scope.SpeechRecognition || scope.webkitSpeechRecognition);
}

export function getCaptionsOptIn() {
  try {
    return localStorage.getItem('joinus_captions_opt_in') === 'true';
  } catch {
    return false;
  }
}

export function setCaptionsOptIn(optIn) {
  try {
    localStorage.setItem('joinus_captions_opt_in', optIn ? 'true' : 'false');
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export class SpeechTranscriber {
  constructor({ onSegment, onError, language = 'en-US' } = {}) {
    this.onSegment = onSegment;
    this.onError = onError;
    this.language = language;
    this.recognition = null;
    this.isListening = false;
    this.restartTimeout = null;
  }

  start() {
    if (!isSpeechRecognitionSupported()) {
      throw new Error('Web Speech API is not supported in this browser.');
    }
    if (this.isListening) return;

    this.isListening = true;
    this.#initRecognition();
    try {
      this.recognition.start();
    } catch (err) {
      // If already started or another error
      if (err.name !== 'InvalidStateError') {
        this.onError?.(err);
      }
    }
  }

  stop() {
    this.isListening = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore stop errors
      }
      this.recognition = null;
    }
  }

  #initRecognition() {
    const scope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    const SpeechRecognitionClass =
      scope?.SpeechRecognition || scope?.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.language;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (!this.isListening) return;
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        const text = item[0]?.transcript?.trim();
        if (!text) continue;
        const final = Boolean(item.isFinal);
        this.onSegment?.({ text, final });
      }
    };

    recognition.onerror = (event) => {
      // 'no-speech' is normal silence during conversation
      if (event.error === 'no-speech') return;
      if (event.error === 'not-allowed') {
        this.isListening = false;
      }
      this.onError?.(event);
    };

    recognition.onend = () => {
      // Web Speech API automatically stops on prolonged silence; restart if user hasn't stopped
      if (this.isListening) {
        this.restartTimeout = setTimeout(() => {
          if (this.isListening) {
            try {
              recognition.start();
            } catch {
              // Ignore restart collision
            }
          }
        }, 250);
      }
    };

    this.recognition = recognition;
  }
}
