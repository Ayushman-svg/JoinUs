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

const CaptionBar = (await import('../src/components/call/CaptionBar.jsx')).default;
const CaptionsOptInModal = (await import('../src/components/call/CaptionsOptInModal.jsx')).default;
const TranscriptPanel = (await import('../src/components/call/TranscriptPanel.jsx')).default;
const CallControls = (await import('../src/components/call/CallControls.jsx')).default;

test('CaptionBar: renders speaker name, clamped text, size and position classes, and distinguishes interim live segments', () => {
  // 1. Interim segment test
  const interimCaption = {
    name: 'Sarah',
    text: 'Hello everyone, can you hear me properly?',
    final: false,
  };

  const interimHtml = renderToStaticMarkup(
    React.createElement(CaptionBar, {
      caption: interimCaption,
      size: 'M',
      position: 'bottom',
    })
  );

  assert.ok(interimHtml.includes('Sarah'), 'Must render speaker name');
  assert.ok(interimHtml.includes('Hello everyone, can you hear me properly?'), 'Must render caption text');
  assert.ok(interimHtml.includes('caption-bar-container--bottom'), 'Must have bottom position class');
  assert.ok(interimHtml.includes('caption-bar-container--size-m'), 'Must have M size class');
  assert.ok(interimHtml.includes('Live'), 'Must show Live tag for interim segment');
  assert.ok(interimHtml.includes('caption-bar__text--interim'), 'Must apply interim text style');

  // 2. Final segment with top position and L size
  const finalCaption = {
    name: 'David',
    text: 'Yes, audio sounds crystal clear.',
    final: true,
  };

  const finalHtml = renderToStaticMarkup(
    React.createElement(CaptionBar, {
      caption: finalCaption,
      size: 'L',
      position: 'top',
    })
  );

  assert.ok(finalHtml.includes('David'));
  assert.ok(finalHtml.includes('Yes, audio sounds crystal clear.'));
  assert.ok(finalHtml.includes('caption-bar-container--top'), 'Must have top position class');
  assert.ok(finalHtml.includes('caption-bar-container--size-l'), 'Must have L size class');
  assert.ok(!finalHtml.includes('caption-bar__text--interim'), 'Final segment must not have interim class');
});

test('CaptionsOptInModal: clearly states browser vendor speech service policy and requires explicit consent', () => {
  const html = renderToStaticMarkup(
    React.createElement(CaptionsOptInModal, {
      open: true,
      onConfirm: () => {},
      onCancel: () => {},
    })
  );

  assert.ok(html.includes('Turn on Live Captions'), 'Must render modal title');
  assert.ok(html.includes('Web Speech API'), 'Must mention Web Speech API');
  assert.ok(
    html.includes('browser vendor') || html.includes('speech recognition service'),
    'Must explicitly state audio is sent to browser vendor speech service'
  );
  assert.ok(html.includes('I Understand &amp; Turn On') || html.includes('I Understand & Turn On'));
  assert.ok(html.includes('Cancel'));
});

test('TranscriptPanel: renders list with speaker name, formatted offset, live scrolling distinction, and download txt', () => {
  const transcript = [
    { id: '1', name: 'Alice', text: 'Welcome to our quarterly review.', offsetMs: 15000 },
    { id: '2', name: 'Bob', text: 'Thank you Alice, great to be here.', offsetMs: 32000 },
  ];

  const liveCaption = {
    name: 'Bob',
    text: 'Let us begin with the first slide...',
    final: false,
  };

  const html = renderToStaticMarkup(
    React.createElement(TranscriptPanel, {
      isOpen: true,
      transcript,
      liveCaption,
      captionsActive: true,
      meetingCode: 'abc-defg-hij',
    })
  );

  assert.ok(html.includes('Welcome to our quarterly review.'));
  assert.ok(html.includes('Thank you Alice, great to be here.'));
  assert.ok(html.includes('00:15'), 'Must format 15000ms offset as 00:15');
  assert.ok(html.includes('00:32'), 'Must format 32000ms offset as 00:32');
  assert.ok(html.includes('Download .txt'), 'Must have Download .txt button');

  // Distinguishes live caption from saved transcript
  assert.ok(html.includes('transcript-item--live'), 'Must have live indicator item');
  assert.ok(html.includes('Transcribing...'), 'Must indicate ongoing live transcription');
  assert.ok(html.includes('Let us begin with the first slide...'));
});

test('Captions gating: CallControls hides captions button if unsupported or flag is off; renders when enabled', () => {
  // 1. Flag off: no captions button
  _resetFeaturesCacheForTesting();
  _setCachedFeaturesForTesting({ CAPTIONS: false });
  globalThis.SpeechRecognition = class {};

  let html = renderToStaticMarkup(
    React.createElement(CallControls, { media: { stream: null } })
  );
  assert.equal(html.includes('aria-label="Turn on Captions"'), false, 'Captions button must not appear when flag is off');

  // 2. Flag on but Web Speech API missing: no captions button
  _resetFeaturesCacheForTesting();
  _setCachedFeaturesForTesting({ CAPTIONS: true });
  delete globalThis.SpeechRecognition;
  delete globalThis.webkitSpeechRecognition;

  html = renderToStaticMarkup(
    React.createElement(CallControls, { media: { stream: null } })
  );
  assert.equal(html.includes('aria-label="Turn on Captions"'), false, 'Captions button must not appear when browser lacks Web Speech API');

  // 3. Flag on AND Web Speech API present: renders Captions button
  globalThis.SpeechRecognition = class {};
  html = renderToStaticMarkup(
    React.createElement(CallControls, {
      media: { stream: null },
      captionsActive: false,
    })
  );
  assert.ok(html.includes('Captions'), 'Captions button must appear when flag is on and supported');
  assert.ok(html.includes('aria-label="Turn on Captions"'));

  // When active
  html = renderToStaticMarkup(
    React.createElement(CallControls, {
      media: { stream: null },
      captionsActive: true,
    })
  );
  assert.ok(html.includes('aria-label="Turn off Captions"'));
});
