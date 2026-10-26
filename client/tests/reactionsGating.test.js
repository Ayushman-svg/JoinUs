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

const CallControls = (await import('../src/components/call/CallControls.jsx')).default;
const ParticipantTile = (await import('../src/components/call/ParticipantTile.jsx')).default;

test('Reactions gating: CallControls does not render Reactions or Raise Hand button when flag is off', () => {
  _resetFeaturesCacheForTesting();

  const html = renderToStaticMarkup(
    React.createElement(CallControls, {
      media: {},
      handRaised: true,
      onToggleHandRaise: () => {},
      onSendReaction: () => {},
    })
  );

  // Buttons must not be rendered when REACTIONS feature flag is off
  assert.equal(html.includes('zoom-btn--reactions'), false, 'Reactions button must not be rendered');
  assert.equal(html.includes('zoom-reactions-popover'), false, 'Reactions popover must not be rendered');
  assert.equal(html.includes('zoom-btn--raise-hand'), false, 'Raise Hand button must not be rendered');
  assert.equal(html.includes('aria-label="Reactions"'), false);
  assert.equal(html.includes('Raise Hand'), false);
  assert.equal(html.includes('Lower Hand'), false);
});

test('Reactions gating: ParticipantTile does not render hand badge or reaction overlay when flag is off', () => {
  _resetFeaturesCacheForTesting();

  const html = renderToStaticMarkup(
    React.createElement(ParticipantTile, {
      name: 'Guest User',
      handRaised: true,
      reaction: '👍',
    })
  );

  // Hand badge and floating reaction overlay must not be rendered when REACTIONS flag is off
  assert.equal(html.includes('zoom-tile__hand-badge'), false, 'Hand badge must not be rendered');
  assert.equal(html.includes('zoom-tile__floating-reaction'), false, 'Floating reaction overlay must not be rendered');
  assert.equal(html.includes('Hand Raised'), false, 'Hand Raised label must not be rendered');
});

test('Reactions gating: CallControls and ParticipantTile render controls and badge when flag is enabled', () => {
  _setCachedFeaturesForTesting({ REACTIONS: true });

  const controlsHtml = renderToStaticMarkup(
    React.createElement(CallControls, {
      media: {},
      handRaised: false,
      onToggleHandRaise: () => {},
      onSendReaction: () => {},
    })
  );

  assert.equal(controlsHtml.includes('zoom-btn--reactions'), true, 'Reactions button should render when enabled');
  assert.equal(controlsHtml.includes('zoom-btn--raise-hand'), true, 'Raise Hand button should render when enabled');

  const tileHtml = renderToStaticMarkup(
    React.createElement(ParticipantTile, {
      name: 'Guest User',
      handRaised: true,
      reaction: '🎉',
    })
  );

  assert.equal(tileHtml.includes('zoom-tile__hand-badge'), true, 'Hand badge should render when enabled');
});
