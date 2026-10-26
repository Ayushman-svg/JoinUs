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

const {
  default: ChatPanel,
  renderMessageText,
} = await import('../src/components/call/ChatPanel.jsx');

test.beforeEach(() => {
  _resetFeaturesCacheForTesting();
});

test('renderMessageText: detects URLs and renders them with rel="noopener noreferrer" and target="_blank"', () => {
  const rendered = renderMessageText('Check this out: https://example.com/join and http://test.org for info');
  assert.ok(Array.isArray(rendered), 'Multi-part text with links should return an array of nodes');

  const html = renderToStaticMarkup(React.createElement('div', null, rendered));

  assert.ok(html.includes('href="https://example.com/join"'), 'Should linkify https URL');
  assert.ok(html.includes('href="http://test.org"'), 'Should linkify http URL');
  assert.ok(html.includes('rel="noopener noreferrer"'), 'Links must have rel="noopener noreferrer"');
  assert.ok(html.includes('target="_blank"'), 'Links must open in target="_blank"');
  assert.ok(html.includes('Check this out: '), 'Surrounding text must be preserved');
});

test('renderMessageText: escapes html tags and never uses innerHTML', () => {
  const malicious = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
  const rendered = renderMessageText(malicious);
  const html = renderToStaticMarkup(React.createElement('div', null, rendered));

  assert.ok(!html.includes('<script>'), 'HTML script tags must be safely escaped as plain text');
  assert.ok(!html.includes('<img'), 'HTML img tags must be safely escaped as plain text');
  assert.ok(html.includes('&lt;script&gt;'), 'Characters should be HTML entity escaped by React');
});

test('ChatPanel: renders Chat Plus UI (search, reply action, copy action, emoji picker, and quote chips)', () => {
  _setCachedFeaturesForTesting({ CHAT_PLUS: true });

  const messages = [
    {
      id: 'msg-1',
      from: { id: 'u-alice', name: 'Alice', isHost: true },
      text: 'Welcome everyone! See https://example.com for agenda.',
      createdAt: new Date().toISOString(),
      status: 'delivered',
    },
    {
      id: 'msg-2',
      from: { id: 'u-bob', name: 'Bob' },
      to: { id: 'u-alice', name: 'Alice' },
      replyTo: { id: 'msg-1', text: 'Welcome everyone!', fromName: 'Alice' },
      text: 'Thanks Alice, got it!',
      createdAt: new Date().toISOString(),
      status: 'delivered',
    },
  ];

  const html = renderToStaticMarkup(
    React.createElement(ChatPanel, {
      isOpen: true,
      currentUser: { id: 'u-alice', name: 'Alice' },
      peers: [
        { user: { id: 'u-bob', name: 'Bob' }, isHost: false },
      ],
      messages,
      onSendMessage: () => {},
      onClose: () => {},
    })
  );

  // Search box
  assert.ok(html.includes('Search in chat…'), 'Must render search input when CHAT_PLUS is ON');
  assert.ok(html.includes('aria-label="Search messages"'));

  // Message actions (Reply, Copy)
  assert.ok(html.includes('aria-label="Reply to message"'), 'Must render reply button');
  assert.ok(html.includes('aria-label="Copy message text"'), 'Must render copy button');

  // Emoji picker trigger
  assert.ok(html.includes('aria-label="Insert emoji"'), 'Must render emoji button');

  // Reply quote in bubble
  assert.ok(html.includes('chat-bubble__reply-quote'), 'Must render quoted reply container');
  assert.ok(html.includes('Welcome everyone!'), 'Must display quoted message text');

  // Auto link detection in message text
  assert.ok(html.includes('href="https://example.com"'), 'Must linkify URL in chat bubble');
  assert.ok(html.includes('rel="noopener noreferrer"'), 'Must contain rel="noopener noreferrer"');

  // Private badge
  assert.ok(html.includes('Private from Bob'), 'Must render private badge for incoming private message');
});

test('ChatPanel: disables sending and displays alert when recipient leaves the room', () => {
  _setCachedFeaturesForTesting({ CHAT_PLUS: true });

  // Render with recipient Bob selected, but Bob has left peers list
  const html = renderToStaticMarkup(
    React.createElement(ChatPanel, {
      isOpen: true,
      currentUser: { id: 'u-alice', name: 'Alice' },
      peers: [], // Bob is gone from room
      initialRecipient: { id: 'u-bob', name: 'Bob' },
      messages: [],
      onSendMessage: () => {},
      onClose: () => {},
    })
  );

  // Assert recipient leaving alert banner and disabled state
  assert.ok(html.includes('Bob left the meeting'), 'Must display alert that recipient left');
  assert.ok(html.includes('Bob (left)'), 'Must indicate recipient has left in select dropdown');
  assert.ok(html.includes('disabled=""'), 'Must disable textarea and sending');
});

test('ChatPanel: hides Chat Plus specific controls when FEATURE_CHAT_PLUS is disabled', () => {
  _setCachedFeaturesForTesting({ CHAT_PLUS: false });

  const messages = [
    {
      id: 'msg-1',
      from: { id: 'u-alice', name: 'Alice' },
      text: 'Simple message',
      createdAt: new Date().toISOString(),
      status: 'delivered',
    },
  ];

  const html = renderToStaticMarkup(
    React.createElement(ChatPanel, {
      isOpen: true,
      currentUser: { id: 'u-alice', name: 'Alice' },
      peers: [],
      messages,
      onSendMessage: () => {},
      onClose: () => {},
    })
  );

  // When CHAT_PLUS is false:
  assert.ok(!html.includes('Search in chat…'), 'Must not render search input when CHAT_PLUS is OFF');
  assert.ok(!html.includes('aria-label="Reply to message"'), 'Must not render reply button');
  assert.ok(!html.includes('aria-label="Insert emoji"'), 'Must not render emoji picker button');
});
