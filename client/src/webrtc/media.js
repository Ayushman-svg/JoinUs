// Camera and microphone capture. Plain JavaScript with no React, so it can be reused
// outside the web UI. Every failure is turned into a MediaError with one of the codes below.

export const MediaErrorCode = Object.freeze({
  PERMISSION_DENIED: 'PERMISSION_DENIED', // the user or the browser blocked access
  NO_DEVICE: 'NO_DEVICE', // no camera or microphone was found
  DEVICE_IN_USE: 'DEVICE_IN_USE', // another app or tab holds the device
  UNSUPPORTED: 'UNSUPPORTED', // no getUserMedia, or the page is not served over HTTPS
  UNKNOWN: 'UNKNOWN', // anything else
});

// Browser error names (current and legacy) mapped to our codes
const CODE_BY_ERROR_NAME = {
  NotAllowedError: MediaErrorCode.PERMISSION_DENIED,
  PermissionDeniedError: MediaErrorCode.PERMISSION_DENIED,
  PermissionDismissedError: MediaErrorCode.PERMISSION_DENIED,
  SecurityError: MediaErrorCode.UNSUPPORTED,
  NotFoundError: MediaErrorCode.NO_DEVICE,
  DevicesNotFoundError: MediaErrorCode.NO_DEVICE,
  OverconstrainedError: MediaErrorCode.NO_DEVICE, // the requested device is gone
  ConstraintNotSatisfiedError: MediaErrorCode.NO_DEVICE,
  NotReadableError: MediaErrorCode.DEVICE_IN_USE,
  TrackStartError: MediaErrorCode.DEVICE_IN_USE,
  AbortError: MediaErrorCode.DEVICE_IN_USE, // Firefox: "Starting video failed"
};

// Failures where trying the camera and the microphone separately can still succeed.
// PERMISSION_DENIED is left out on purpose: a second attempt could prompt the user again.
const FALLBACK_CODES = new Set([MediaErrorCode.NO_DEVICE, MediaErrorCode.DEVICE_IN_USE]);

export class MediaError extends Error {
  constructor(code, message, { cause, requested } = {}) {
    super(message, { cause });
    this.name = 'MediaError';
    this.code = code; // one of MediaErrorCode
    this.requested = requested; // { audio, video } that was being requested
  }
}

function deviceName({ audio, video }, joiner) {
  if (audio && video) return `camera ${joiner} microphone`;
  return video ? 'camera' : 'microphone';
}

// Plain-language text that can be shown to the user as it is
function messageFor(code, requested) {
  switch (code) {
    case MediaErrorCode.PERMISSION_DENIED:
      return `Access to your ${deviceName(requested, 'and')} is blocked. Allow it in your browser's site settings, then try again.`;
    case MediaErrorCode.NO_DEVICE:
      return `No ${deviceName(requested, 'or')} was found. Connect one and try again.`;
    case MediaErrorCode.DEVICE_IN_USE:
      return `Your ${deviceName(requested, 'or')} is being used by another app or browser tab. Close it and try again.`;
    case MediaErrorCode.UNSUPPORTED:
      return "This browser can't use your camera and microphone here. Open the meeting in an up-to-date browser over a secure (HTTPS) connection.";
    default:
      return `We couldn't start your ${deviceName(requested, 'and')}. Please try again.`;
  }
}

export function toMediaError(err, requested) {
  if (err instanceof MediaError) return err;
  const code = CODE_BY_ERROR_NAME[err?.name] ?? MediaErrorCode.UNKNOWN;
  return new MediaError(code, messageFor(code, requested), { cause: err, requested });
}

export function isMediaSupported() {
  return (
    typeof globalThis.navigator?.mediaDevices?.getUserMedia === 'function' &&
    globalThis.isSecureContext !== false
  );
}

function buildConstraints({ audio, video, audioDeviceId, videoDeviceId }) {
  return {
    audio: audio
      ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(audioDeviceId && { deviceId: { exact: audioDeviceId } }),
        }
      : false,
    video: video
      ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
          ...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : { facingMode: 'user' }),
        }
      : false,
  };
}

// Captures the requested devices and returns a MediaStream. Throws a MediaError.
export async function getLocalStream({ audio = true, video = true, audioDeviceId, videoDeviceId } = {}) {
  const requested = { audio: Boolean(audio), video: Boolean(video) };
  if (!requested.audio && !requested.video) {
    throw new TypeError('getLocalStream needs audio, video or both');
  }
  if (!isMediaSupported()) {
    throw new MediaError(MediaErrorCode.UNSUPPORTED, messageFor(MediaErrorCode.UNSUPPORTED, requested), {
      requested,
    });
  }

  try {
    return await navigator.mediaDevices.getUserMedia(
      buildConstraints({ ...requested, audioDeviceId, videoDeviceId })
    );
  } catch (err) {
    throw toMediaError(err, requested);
  }
}

// Like getLocalStream, but when one device is missing or busy it still returns the other,
// so someone without a camera can join with the microphone only.
// Returns { stream, audioError, videoError }; the error for a device that worked is null.
// Throws only when nothing could be captured.
export async function getLocalStreamWithFallback(options = {}) {
  const { audio = true, video = true, audioDeviceId, videoDeviceId } = options;

  try {
    const stream = await getLocalStream(options);
    return { stream, audioError: null, videoError: null };
  } catch (err) {
    if (!(audio && video) || !FALLBACK_CODES.has(err.code)) throw err;

    let audioStream = null;
    let videoStream = null;
    let audioError = null;
    let videoError = null;

    try {
      audioStream = await getLocalStream({ audio: true, video: false, audioDeviceId });
    } catch (audioErr) {
      audioError = audioErr;
    }
    try {
      videoStream = await getLocalStream({ audio: false, video: true, videoDeviceId });
    } catch (videoErr) {
      videoError = videoErr;
    }

    if (!audioStream && !videoStream) throw err;

    const tracks = [...(audioStream?.getTracks() ?? []), ...(videoStream?.getTracks() ?? [])];
    return { stream: new MediaStream(tracks), audioError, videoError };
  }
}

// Stops every track, which releases the camera light and the microphone. Safe to call with null.
export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

// kind: 'audio' | 'video'. Returns false when the stream has no track of that kind.
// Note: a disabled video track sends black frames but keeps the camera on. Fully releasing the
// camera needs a track replacement, which is added with device switching.
export function setTrackEnabled(stream, kind, enabled) {
  const tracks = stream?.getTracks().filter((track) => track.kind === kind) ?? [];
  tracks.forEach((track) => {
    track.enabled = enabled;
  });
  return tracks.length > 0;
}

export function isTrackEnabled(stream, kind) {
  return (
    stream?.getTracks().some((track) => track.kind === kind && track.enabled && track.readyState === 'live') ??
    false
  );
}

export function hasLiveTrack(stream, kind) {
  return (
    stream?.getTracks().some((track) => track.kind === kind && track.readyState === 'live') ?? false
  );
}

// Calls onEnded(kind) when a device stops by itself (unplugged, or permission revoked).
// It does not fire for tracks you stop yourself. Returns a function that removes the listeners.
export function watchTracks(stream, onEnded) {
  const removers = stream.getTracks().map((track) => {
    const handler = () => onEnded(track.kind);
    track.addEventListener('ended', handler);
    return () => track.removeEventListener('ended', handler);
  });
  return () => removers.forEach((remove) => remove());
}
