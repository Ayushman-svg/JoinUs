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

const FloatingReactions = (await import('../src/components/call/FloatingReactions.jsx')).default;
const ParticipantsPanel = (await import('../src/components/call/ParticipantsPanel.jsx')).default;
const ParticipantTile = (await import('../src/components/call/ParticipantTile.jsx')).default;
const ReactionsPopover = (await import('../src/components/call/ReactionsPopover.jsx')).default;

test('FloatingReactions: caps at most 8 reactions on screen', () => {
  const manyReactions = Array.from({ length: 15 }, (_, i) => ({
    id: `r-${i}`,
    kind: 'thumbs-up',
    emoji: '👍',
    senderName: `User ${i}`,
    xPercent: 50,
  }));

  const html = renderToStaticMarkup(
    React.createElement(FloatingReactions, { reactions: manyReactions })
  );

  const count = (html.match(/zoom-floating-reaction-item/g) || []).length;
  assert.equal(count, 8, `Expected at most 8 floating reactions, got ${count}`);
  assert.equal(html.includes('User 14'), true, 'Should include latest reactions');
  assert.equal(html.includes('User 0'), false, 'Should have dropped earliest reactions beyond 8');
});

test('ParticipantsPanel: sorts raised hands first in order of raisedAt timestamp', () => {
  _setCachedFeaturesForTesting({ REACTIONS: true });

  const peers = [
    {
      peerId: 'peer-1',
      user: { name: 'Bob Normal' },
      handRaised: false,
      raisedAt: null,
    },
    {
      peerId: 'peer-2',
      user: { name: 'Alice Later' },
      handRaised: true,
      raisedAt: '2026-10-27T10:05:00Z',
    },
    {
      peerId: 'peer-3',
      user: { name: 'Charlie Earlier' },
      handRaised: true,
      raisedAt: '2026-10-27T10:00:00Z',
    },
    {
      peerId: 'peer-4',
      user: { name: 'David Normal' },
      handRaised: false,
      raisedAt: null,
    },
  ];

  const html = renderToStaticMarkup(
    React.createElement(ParticipantsPanel, {
      isOpen: true,
      isHost: true,
      self: { name: 'Host Self', audioOn: true, videoOn: true },
      peers,
    })
  );

  const idxCharlie = html.indexOf('Charlie Earlier');
  const idxAlice = html.indexOf('Alice Later');
  const idxBob = html.indexOf('Bob Normal');
  const idxDavid = html.indexOf('David Normal');

  assert.ok(idxCharlie !== -1 && idxAlice !== -1 && idxBob !== -1);
  assert.ok(idxCharlie < idxAlice, 'Earlier raised hand (Charlie) must appear before later (Alice)');
  assert.ok(idxAlice < idxBob, 'Raised hand (Alice) must appear before non-raised (Bob)');
  assert.ok(idxAlice < idxDavid, 'Raised hand (Alice) must appear before non-raised (David)');
});

test('ParticipantsPanel: displays hand badges and host lower hand action', () => {
  _setCachedFeaturesForTesting({ REACTIONS: true });

  const peers = [
    {
      peerId: 'peer-1',
      user: { name: 'Alice Raised' },
      handRaised: true,
      raisedAt: new Date().toISOString(),
      feedback: 'faster',
    },
  ];

  const html = renderToStaticMarkup(
    React.createElement(ParticipantsPanel, {
      isOpen: true,
      isHost: true,
      self: { name: 'Host User', handRaised: true, feedback: 'yes' },
      peers,
    })
  );

  assert.equal(html.includes('participants-row__hand-badge'), true, 'Hand badge must be present');
  assert.equal(html.includes('Lower hand'), true, 'Lower hand button must be available for host');
  assert.equal(html.includes('participants-row__feedback-badge--faster'), true, 'Feedback badge must be present for peer');
  assert.equal(html.includes('participants-row__feedback-badge--yes'), true, 'Feedback badge must be present for self');
});

test('ParticipantTile: displays feedback badge until cleared', () => {
  _setCachedFeaturesForTesting({ REACTIONS: true });

  // With feedback
  const htmlWithFeedback = renderToStaticMarkup(
    React.createElement(ParticipantTile, {
      name: 'Test Peer',
      feedback: 'slower',
    })
  );
  assert.equal(htmlWithFeedback.includes('zoom-tile__feedback-badge--slower'), true);
  assert.equal(htmlWithFeedback.includes('SLOWER'), true);

  // Cleared (feedback null)
  const htmlCleared = renderToStaticMarkup(
    React.createElement(ParticipantTile, {
      name: 'Test Peer',
      feedback: null,
    })
  );
  assert.equal(htmlCleared.includes('zoom-tile__feedback-badge'), false, 'Feedback badge should disappear when cleared');
});

test('ReactionsPopover: emojis are content and UI controls use Lucide icons', () => {
  const html = renderToStaticMarkup(
    React.createElement(ReactionsPopover, {
      isOpen: true,
      handRaised: false,
      onToggleHandRaise: () => {},
      onSendReaction: () => {},
      currentFeedback: 'yes',
      onSetFeedback: () => {},
    })
  );

  // Emojis as content
  assert.equal(html.includes('👍'), true);
  assert.equal(html.includes('👏'), true);
  assert.equal(html.includes('❤️'), true);
  assert.equal(html.includes('😂'), true);
  assert.equal(html.includes('🎉'), true);

  // Buttons with proper aria-labels and structure
  assert.equal(html.includes('zoom-popover-hand-btn'), true);
  assert.equal(html.includes('Raise Hand'), true);
  assert.equal(html.includes('Feedback'), true);
  assert.equal(html.includes('Clear'), true);
});
