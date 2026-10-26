import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Register jsx transpiler loader for tests
register('./jsxLoader.js', import.meta.url);

const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');

const {
  _resetFeaturesCacheForTesting,
  _setCachedFeaturesForTesting,
} = await import('../src/hooks/useFeature.js');

const MeetingHeader = (await import('../src/components/call/MeetingHeader.jsx')).default;
const ParticipantsPanel = (await import('../src/components/call/ParticipantsPanel.jsx')).default;
const ParticipantTile = (await import('../src/components/call/ParticipantTile.jsx')).default;
const CallProblem = (await import('../src/components/call/CallProblem.jsx')).default;
const CallStatusCard = (await import('../src/components/call/CallStatusCard.jsx')).default;

test('MeetingHeader: renders Locked pill when meeting is locked', () => {
  const unlockedHtml = renderToStaticMarkup(
    React.createElement(MeetingHeader, {
      title: 'Security Room',
      isLocked: false,
    })
  );
  assert.equal(unlockedHtml.includes('zoom-locked-pill'), false, 'Should not render locked pill when unlocked');

  const lockedHtml = renderToStaticMarkup(
    React.createElement(MeetingHeader, {
      title: 'Security Room',
      isLocked: true,
    })
  );
  assert.equal(lockedHtml.includes('zoom-locked-pill'), true, 'Should render locked pill when isLocked is true');
  assert.equal(lockedHtml.includes('Locked'), true, 'Should show Locked text');
});

test('ParticipantTile: renders Host and Co-host role badges', () => {
  const hostHtml = renderToStaticMarkup(
    React.createElement(ParticipantTile, {
      name: 'Alice Host',
      isHost: true,
      isCoHost: false,
    })
  );
  assert.equal(hostHtml.includes('(Host)'), true, 'Should render (Host) tag');

  const coHostHtml = renderToStaticMarkup(
    React.createElement(ParticipantTile, {
      name: 'Bob CoHost',
      isHost: false,
      isCoHost: true,
    })
  );
  assert.equal(coHostHtml.includes('(Co-host)'), true, 'Should render (Co-host) tag');
  assert.equal(coHostHtml.includes('zoom-tile__host-tag--cohost'), true, 'Should have cohost css class');

  const regularHtml = renderToStaticMarkup(
    React.createElement(ParticipantTile, {
      name: 'Charlie Guest',
      isHost: false,
      isCoHost: false,
    })
  );
  assert.equal(regularHtml.includes('(Host)'), false);
  assert.equal(regularHtml.includes('(Co-host)'), false);
});

test('ParticipantsPanel: displays role badges and moderator actions', () => {
  _setCachedFeaturesForTesting({ HOST_SECURITY: true, REACTIONS: true });

  const self = { name: 'Host User', audioOn: true, videoOn: true };
  const peers = [
    {
      peerId: 'peer-cohost',
      user: { name: 'CoHost Peer' },
      isHost: false,
      isCoHost: true,
      audio: true,
      video: true,
    },
    {
      peerId: 'peer-guest',
      user: { name: 'Regular Guest' },
      isHost: false,
      isCoHost: false,
      audio: false,
      video: false,
    },
  ];

  const html = renderToStaticMarkup(
    React.createElement(ParticipantsPanel, {
      isOpen: true,
      isHost: true,
      isCoHost: false,
      canModerate: true,
      self,
      peers,
    })
  );

  // Checks Host and Co-host badges
  assert.equal(html.includes('Host'), true, 'Host badge present');
  assert.equal(html.includes('Co-host'), true, 'Co-host badge present');

  // Moderator actions
  assert.equal(html.includes('Mute All'), true, 'Host should see Mute All button');
  assert.equal(html.includes('Options for Regular Guest'), true, 'Should render options dropdown for peers');
});

test('ParticipantsPanel: Co-hosts cannot moderate the host', () => {
  _setCachedFeaturesForTesting({ HOST_SECURITY: true });

  const self = { name: 'CoHost User', audioOn: true, videoOn: true };
  const peers = [
    {
      peerId: 'peer-host',
      user: { name: 'Room Host' },
      isHost: true,
      isCoHost: false,
      audio: true,
      video: true,
    },
    {
      peerId: 'peer-guest',
      user: { name: 'Participant Guest' },
      isHost: false,
      isCoHost: false,
      audio: true,
      video: true,
    },
  ];

  const html = renderToStaticMarkup(
    React.createElement(ParticipantsPanel, {
      isOpen: true,
      isHost: false,
      isCoHost: true,
      canModerate: true,
      self,
      peers,
    })
  );

  // Co-host can act on normal participant
  assert.equal(html.includes('Options for Participant Guest'), true, 'Co-host can act on regular participant');
  // Co-host CANNOT act on host
  assert.equal(html.includes('Options for Room Host'), false, 'Co-hosts can never act on the host');
});

const { MemoryRouter } = await import('react-router-dom');

test('CallProblem: handles security gate errors', () => {
  const blockedHtml = renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(CallProblem, { code: 'BLOCKED' }))
  );
  assert.equal(blockedHtml.includes('blocked'), true, 'Should state user is blocked');

  const lockedHtml = renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(CallProblem, { code: 'MEETING_LOCKED' }))
  );
  assert.equal(lockedHtml.includes('locked'), true, 'Should state meeting is locked');

  const rateLimitedHtml = renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(CallProblem, { code: 'RATE_LIMITED' }))
  );
  assert.equal(rateLimitedHtml.includes('Too many attempts'), true, 'Should state rate limited');

  const passcodeHtml = renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(CallProblem, { code: 'PASSCODE_REQUIRED' }))
  );
  assert.equal(passcodeHtml.includes('Passcode required'), true, 'Should prompt for passcode');
});

test('CallStatusCard: reflects BLOCKED reason on removal', () => {
  const normalRemovedHtml = renderToStaticMarkup(
    React.createElement(CallStatusCard, { status: 'removed' })
  );
  assert.equal(normalRemovedHtml.includes('removed from the meeting'), true);

  const blockedHtml = renderToStaticMarkup(
    React.createElement(CallStatusCard, { status: 'removed', reason: 'BLOCKED' })
  );
  assert.equal(blockedHtml.includes('removed and blocked'), true, 'Should inform user they were blocked');
});
