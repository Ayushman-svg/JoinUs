import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDuration, nextFullHour, toLocalInputValue } from '../src/lib/datetime.js';
import { extractMeetingCode } from '../src/lib/meetingLink.js';

if (!globalThis.window) {
  globalThis.window = { location: { origin: 'http://localhost:5173' } };
}

test('datetime helpers: formatDuration formats durations correctly', () => {
  assert.equal(formatDuration(0), '0 min');
  assert.equal(formatDuration(-1000), '0 min');
  assert.equal(formatDuration(15000), '< 1 min');
  assert.equal(formatDuration(60000), '1 min');
  assert.equal(formatDuration(25 * 60000), '25 min');
  assert.equal(formatDuration(60 * 60000), '1h');
  assert.equal(formatDuration(90 * 60000), '1h 30m');
  assert.equal(formatDuration(125 * 60000), '2h 5m');
});

test('datetime helpers: toLocalInputValue pads date-time string', () => {
  const d = new Date(2026, 9, 25, 9, 5); // Oct 25 2026 09:05
  assert.equal(toLocalInputValue(d), '2026-10-25T09:05');
});

test('datetime helpers: nextFullHour sets minutes and seconds to 0', () => {
  const next = nextFullHour();
  assert.equal(next.getMinutes(), 0);
  assert.equal(next.getSeconds(), 0);
  assert.equal(next.getMilliseconds(), 0);
});

test('meetingLink helpers: extractMeetingCode extracts valid codes', () => {
  assert.equal(extractMeetingCode('abc-defg-hij'), 'abc-defg-hij');
  assert.equal(extractMeetingCode('ABC-DEFG-HIJ'), 'abc-defg-hij');
  assert.equal(extractMeetingCode('  abc-defg-hij  '), 'abc-defg-hij');
  assert.equal(extractMeetingCode('https://joinus.app/m/abc-defg-hij'), 'abc-defg-hij');
  assert.equal(extractMeetingCode('http://localhost:5173/m/xyz-uvwx-rst?ref=email'), 'xyz-uvwx-rst');
  assert.equal(extractMeetingCode('invalid-code'), null);
  assert.equal(extractMeetingCode(''), null);
  assert.equal(extractMeetingCode(null), null);
});
