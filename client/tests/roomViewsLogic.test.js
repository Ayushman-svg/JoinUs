import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateAudioLevelPercent,
  calculateGalleryItems,
  countHiddenNonVideoPeers,
  filterVisiblePeers,
  formatDuration,
  selectFeaturedParticipant,
} from '../src/utils/roomLayout.js';

test('Room layout logic: calculateGalleryItems grid capping up to 4', () => {
  // Case 1: Local user alone
  const localOnly = calculateGalleryItems([], true, 4);
  assert.equal(localOnly.length, 1);
  assert.equal(localOnly[0].id, 'local');
  assert.equal(localOnly[0].isLocal, true);

  // Case 2: 3 peers (4 total in room: local + 3 peers)
  const peers3 = [
    { peerId: 'p-1', user: { name: 'Alice' } },
    { peerId: 'p-2', user: { name: 'Bob' } },
    { peerId: 'p-3', user: { name: 'Charlie' } },
  ];
  const grid4 = calculateGalleryItems(peers3, true, 4);
  assert.equal(grid4.length, 4);
  assert.equal(grid4[0].id, 'local');
  assert.equal(grid4[1].id, 'p-1');
  assert.equal(grid4[2].id, 'p-2');
  assert.equal(grid4[3].id, 'p-3');

  // Case 3: 7 peers (8 total in room) -> capped at max 4 tiles for Zoom-style balanced grid
  const peers7 = [
    { peerId: 'p-1' },
    { peerId: 'p-2' },
    { peerId: 'p-3' },
    { peerId: 'p-4' },
    { peerId: 'p-5' },
    { peerId: 'p-6' },
    { peerId: 'p-7' },
  ];
  const gridCapped = calculateGalleryItems(peers7, true, 4);
  assert.equal(gridCapped.length, 4, 'Should cap gallery view to exactly 4 tiles');

  // Case 4: When roomViewsEnabled flag is off, retains all participants
  const gridUncapped = calculateGalleryItems(peers7, false, 4);
  assert.equal(gridUncapped.length, 8, 'Should not cap tiles when room views flag is disabled');
});

test('Room layout logic: filterVisiblePeers and countHiddenNonVideoPeers', () => {
  const peers = [
    { peerId: 'p-1', video: true },
    { peerId: 'p-2', video: false },
    { peerId: 'p-3', video: true },
    { peerId: 'p-4', video: false },
  ];

  // With hideNonVideo = false, all peers are visible
  const allVisible = filterVisiblePeers(peers, false);
  assert.equal(allVisible.length, 4);
  assert.equal(countHiddenNonVideoPeers(peers, false), 0);

  // With hideNonVideo = true, only peers with video=true are visible
  const onlyVideo = filterVisiblePeers(peers, true);
  assert.equal(onlyVideo.length, 2);
  assert.deepEqual(
    onlyVideo.map((p) => p.peerId),
    ['p-1', 'p-3']
  );
  assert.equal(countHiddenNonVideoPeers(peers, true), 2);

  // Pinned peer with video=false MUST NOT be hidden
  const withPinnedNonVideo = filterVisiblePeers(peers, true, 'p-2');
  assert.equal(withPinnedNonVideo.length, 3);
  assert.deepEqual(
    withPinnedNonVideo.map((p) => p.peerId),
    ['p-1', 'p-2', 'p-3'],
    'Pinned peer must remain visible even with video turned off'
  );
  assert.equal(
    countHiddenNonVideoPeers(peers, true, 'p-2'),
    1,
    'Pinned non-video peer should not be counted as hidden'
  );
});

test('Speaker selection logic: pinned participant takes precedence over active speaker', () => {
  const peerAlice = { peerId: 'alice-id', user: { name: 'Alice' } };
  const peerBob = { peerId: 'bob-id', user: { name: 'Bob' } };
  const peers = [peerAlice, peerBob];

  // Case 1: Bob is pinned, Alice is speaking -> Bob is featured
  const result1 = selectFeaturedParticipant({
    pinnedId: 'bob-id',
    activeSpeakerId: 'alice-id',
    peers,
  });
  assert.equal(result1.isLocal, false);
  assert.equal(result1.featuredPeer?.peerId, 'bob-id');

  // Case 2: Local user is pinned, Bob is speaking -> Local user is featured
  const result2 = selectFeaturedParticipant({
    pinnedId: 'local',
    activeSpeakerId: 'bob-id',
    peers,
  });
  assert.equal(result2.isLocal, true);
  assert.equal(result2.featuredPeer, null);

  // Case 3: Nobody is pinned, Alice is speaking -> Alice is featured
  const result3 = selectFeaturedParticipant({
    pinnedId: null,
    activeSpeakerId: 'alice-id',
    peers,
  });
  assert.equal(result3.isLocal, false);
  assert.equal(result3.featuredPeer?.peerId, 'alice-id');

  // Case 4: Nobody is pinned, local is speaking -> Local user is featured
  const result4 = selectFeaturedParticipant({
    pinnedId: null,
    activeSpeakerId: 'local',
    peers,
  });
  assert.equal(result4.isLocal, true);
  assert.equal(result4.featuredPeer, null);

  // Case 5: Nobody is pinned, nobody is speaking -> Fallback to local user
  const result5 = selectFeaturedParticipant({
    pinnedId: null,
    activeSpeakerId: null,
    peers,
  });
  assert.equal(result5.isLocal, true);
  assert.equal(result5.featuredPeer, null);

  // Case 6: Pinned peer left the meeting -> Fallback to active speaker
  const result6 = selectFeaturedParticipant({
    pinnedId: 'departed-peer-id',
    activeSpeakerId: 'alice-id',
    peers,
  });
  assert.equal(result6.isLocal, false);
  assert.equal(result6.featuredPeer?.peerId, 'alice-id');
});

test('Audio level calculation: calculateAudioLevelPercent converts byte data to 0-100%', () => {
  // Empty or null
  assert.equal(calculateAudioLevelPercent(null), 0);
  assert.equal(calculateAudioLevelPercent([]), 0);

  // Silence (all 0s)
  const silence = new Uint8Array([0, 0, 0, 0, 0]);
  assert.equal(calculateAudioLevelPercent(silence), 0);

  // Mid volume: average 64 -> (64 / 128) * 100 = 50%
  const mid = new Uint8Array([64, 64, 64, 64]);
  assert.equal(calculateAudioLevelPercent(mid), 50);

  // Loud speech: average 96 -> (96 / 128) * 100 = 75%
  const loud = new Uint8Array([96, 96, 96, 96]);
  assert.equal(calculateAudioLevelPercent(loud), 75);

  // Max / clipping volume: average 255 -> clamped to 100%
  const clipping = new Uint8Array([255, 255, 255, 255]);
  assert.equal(calculateAudioLevelPercent(clipping), 100);
});

test('Duration timer logic: formatDuration formats MM:SS and HH:MM:SS', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(9), '00:09');
  assert.equal(formatDuration(65), '01:05');
  assert.equal(formatDuration(599), '09:59');
  assert.equal(formatDuration(3600), '01:00:00');
  assert.equal(formatDuration(3665), '01:01:05');
  assert.equal(formatDuration(7325), '02:02:05');
  assert.equal(formatDuration(-10), '00:00');
});
