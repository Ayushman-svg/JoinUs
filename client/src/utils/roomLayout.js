/**
 * Pure functions for meeting room layout calculation, speaker selection,
 * audio level metering, and timer formatting.
 */

/**
 * Filters participants when "Hide non-video participants" is enabled.
 * Pinned participants always stay visible regardless of camera state.
 */
export function filterVisiblePeers(peers = [], hideNonVideo = false, pinnedId = null) {
  if (!hideNonVideo) return peers;
  return peers.filter((p) => Boolean(p.video) || p.peerId === pinnedId);
}

/**
 * Counts how many peers are hidden because their video is off (and not pinned).
 */
export function countHiddenNonVideoPeers(peers = [], hideNonVideo = false, pinnedId = null) {
  if (!hideNonVideo) return 0;
  return peers.filter((p) => !p.video && p.peerId !== pinnedId).length;
}

/**
 * Selects the featured participant in Speaker view.
 * Resolution precedence:
 * 1. Pinned participant ('local' or peerId)
 * 2. Active speaker peer
 * 3. Local participant (fallback when active speaker is local or nobody else is speaking)
 *
 * @returns {{ isLocal: boolean, featuredPeer: object | null }}
 */
export function selectFeaturedParticipant({
  pinnedId = null,
  activeSpeakerId = null,
  peers = [],
} = {}) {
  // If explicitly pinned to local user
  if (pinnedId === 'local') {
    return { isLocal: true, featuredPeer: null };
  }

  // If a remote peer is pinned
  if (pinnedId) {
    const pinned = peers.find((p) => p.peerId === pinnedId);
    if (pinned) {
      return { isLocal: false, featuredPeer: pinned };
    }
  }

  // Next precedence: active speaker peer
  if (activeSpeakerId && activeSpeakerId !== 'local') {
    const active = peers.find((p) => p.peerId === activeSpeakerId);
    if (active) {
      return { isLocal: false, featuredPeer: active };
    }
  }

  // Fallback: local is featured
  return { isLocal: true, featuredPeer: null };
}

/**
 * Computes the gallery view items capped at maxTiles (default 4).
 *
 * @param {Array} visiblePeers
 * @param {boolean} roomViewsEnabled
 * @param {number} maxTiles
 * @returns {Array<{ id: string, isLocal: boolean, peer?: object }>}
 */
export function calculateGalleryItems(visiblePeers = [], roomViewsEnabled = true, maxTiles = 4) {
  const items = [
    { id: 'local', isLocal: true },
    ...visiblePeers.map((p) => ({ id: p.peerId, isLocal: false, peer: p })),
  ];
  return roomViewsEnabled ? items.slice(0, maxTiles) : items;
}

/**
 * Computes the audio level percentage (0 - 100) from frequency byte data.
 * @param {Uint8Array|number[]} dataArray
 * @returns {number} Integer between 0 and 100
 */
export function calculateAudioLevelPercent(dataArray) {
  if (!dataArray || dataArray.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  const avg = sum / dataArray.length;
  return Math.min(100, Math.round((avg / 128) * 100));
}

/**
 * Formats elapsed meeting duration in MM:SS or HH:MM:SS.
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatDuration(totalSeconds = 0) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(remMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(remMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
