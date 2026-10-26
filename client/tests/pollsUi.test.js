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

const PollResultBar = (await import('../src/components/call/PollResultBar.jsx')).default;
const PollsPanel = (await import('../src/components/call/PollsPanel.jsx')).default;
const ParticipantPollCard = (await import('../src/components/call/ParticipantPollCard.jsx')).default;
const CallControls = (await import('../src/components/call/CallControls.jsx')).default;

test('PollResultBar: renders plain CSS progress bar with explicit text percentages and vote counts', () => {
  const option = { id: 'opt-1', text: 'Option A', votes: 4 };
  const totalVotes = 10; // 40%

  const html = renderToStaticMarkup(
    React.createElement(PollResultBar, { option, totalVotes, isUserVote: true })
  );

  // Assert text percentage and counts are explicitly rendered (not color only)
  assert.ok(html.includes('40%'), 'Must display text percentage 40%');
  assert.ok(html.includes('4 votes'), 'Must display text vote count');
  assert.ok(html.includes('Option A'), 'Must display option text');
  assert.ok(html.includes('(Your vote)'), 'Must indicate user vote');
  assert.ok(html.includes('role="progressbar"'), 'Must have accessible progressbar role');
  assert.ok(html.includes('aria-valuenow="40"'), 'Must have aria-valuenow="40"');
  assert.ok(html.includes('width:40%'), 'Must set CSS bar width to 40%');
});

test('ParticipantPollCard: renders single-choice radio options and submit button when open', () => {
  const poll = {
    id: 'poll-single',
    question: 'Favorite food?',
    options: [
      { id: 'opt-1', text: 'Pizza', votes: 0 },
      { id: 'opt-2', text: 'Burgers', votes: 0 },
    ],
    multiple: false,
    anonymous: true,
    shareResults: true,
    status: 'open',
    hasVoted: false,
    totalVotes: 0,
  };

  const html = renderToStaticMarkup(
    React.createElement(ParticipantPollCard, { poll })
  );

  assert.ok(html.includes('type="radio"'), 'Single choice poll must render radio inputs');
  assert.ok(html.includes('Pizza') && html.includes('Burgers'));
  assert.ok(html.includes('Anonymous'), 'Must show anonymous indicator');
  assert.ok(html.includes('Submit Vote'), 'Must render submit button');
});

test('ParticipantPollCard: renders multiple-choice checkbox options when multiple is true', () => {
  const poll = {
    id: 'poll-multi',
    question: 'Select all hobbies:',
    options: [
      { id: 'opt-1', text: 'Coding', votes: 1 },
      { id: 'opt-2', text: 'Music', votes: 1 },
      { id: 'opt-3', text: 'Sports', votes: 0 },
    ],
    multiple: true,
    anonymous: false,
    shareResults: true,
    status: 'open',
    hasVoted: false,
    totalVotes: 2,
  };

  const html = renderToStaticMarkup(
    React.createElement(ParticipantPollCard, { poll })
  );

  assert.ok(html.includes('type="checkbox"'), 'Multiple choice poll must render checkbox inputs');
  assert.ok(html.includes('Select multiple'), 'Must show select multiple badge');
  assert.ok(html.includes('Public'), 'Must show public badge');
});

test('ParticipantPollCard: renders confirmation message after voting', () => {
  const poll = {
    id: 'poll-voted',
    question: 'Is it confirmed?',
    options: [{ id: 'opt-1', text: 'Yes', votes: 1 }, { id: 'opt-2', text: 'No', votes: 0 }],
    multiple: false,
    anonymous: true,
    shareResults: true,
    status: 'open',
    hasVoted: true,
    userVote: ['opt-1'],
    totalVotes: 1,
  };

  const html = renderToStaticMarkup(
    React.createElement(ParticipantPollCard, { poll })
  );

  assert.ok(html.includes('Vote Submitted'), 'Must render vote submitted title');
  assert.ok(html.includes('Results will be shown here once the host closes the poll.'));
  assert.equal(html.includes('type="radio"'), false, 'Should not render radio inputs when voted');
});

test('ParticipantPollCard: renders results view with text percentages when closed with shareResults=true', () => {
  const poll = {
    id: 'poll-closed-shared',
    question: 'Final decision?',
    options: [
      { id: 'opt-1', text: 'Approve', votes: 3 },
      { id: 'opt-2', text: 'Reject', votes: 1 },
    ],
    multiple: false,
    anonymous: true,
    shareResults: true,
    status: 'closed',
    totalVotes: 4,
  };

  const html = renderToStaticMarkup(
    React.createElement(ParticipantPollCard, { poll })
  );

  assert.ok(html.includes('Poll Closed'), 'Must show poll closed badge');
  assert.ok(html.includes('75%'), 'Must show 75% for 3/4 votes');
  assert.ok(html.includes('25%'), 'Must show 25% for 1/4 votes');
  assert.ok(html.includes('Total votes: 4'), 'Must show total votes count');
});

test('ParticipantPollCard: hides results when closed with shareResults=false', () => {
  const poll = {
    id: 'poll-closed-private',
    question: 'Confidential topic?',
    options: [{ id: 'opt-1', text: 'A', votes: 2 }, { id: 'opt-2', text: 'B', votes: 2 }],
    multiple: false,
    anonymous: true,
    shareResults: false,
    status: 'closed',
    totalVotes: 4,
  };

  const html = renderToStaticMarkup(
    React.createElement(ParticipantPollCard, { poll })
  );

  assert.ok(html.includes('The host chose not to share results.'));
  assert.equal(html.includes('50%'), false, 'Must not expose percentages when shareResults is false');
});

test('PollsPanel: moderator view renders live counts and percentages with plain CSS bars', () => {
  _setCachedFeaturesForTesting({ POLLS: true });

  const activePoll = {
    id: 'poll-mod-1',
    question: 'Should we release today?',
    options: [
      { id: 'opt-yes', text: 'Yes, release', votes: 6 },
      { id: 'opt-no', text: 'No, wait', votes: 2 },
    ],
    multiple: false,
    anonymous: true,
    shareResults: true,
    status: 'open',
    totalVotes: 8,
  };

  const html = renderToStaticMarkup(
    React.createElement(PollsPanel, {
      isOpen: true,
      canModerate: true,
      isHost: true,
      activePoll,
    })
  );

  assert.ok(html.includes('Live'), 'Must show Live status badge');
  assert.ok(html.includes('Anonymous'), 'Must show Anonymous badge');
  assert.ok(html.includes('75%'), 'Must show 75% for 6/8 votes');
  assert.ok(html.includes('25%'), 'Must show 25% for 2/8 votes');
  assert.ok(html.includes('Close Poll'), 'Must show Close Poll action button');
  assert.ok(html.includes('CSV'), 'Host sees CSV export button');
});

test('Polls gating: CallControls does not render Polls button when flag is off', () => {
  _setCachedFeaturesForTesting({ POLLS: false });

  const html = renderToStaticMarkup(
    React.createElement(CallControls, {
      media: { audioEnabled: true, videoEnabled: true },
      isHost: false,
      canModerate: false,
    })
  );

  assert.equal(html.includes('aria-label="Polls"'), false, 'Polls button must not render when POLLS=false');
});

test('Polls gating: CallControls renders Polls button when flag is enabled', () => {
  _setCachedFeaturesForTesting({ POLLS: true });

  const html = renderToStaticMarkup(
    React.createElement(CallControls, {
      media: { audioEnabled: true, videoEnabled: true },
      isHost: false,
      canModerate: false,
    })
  );

  assert.ok(html.includes('aria-label="Polls"'), 'Polls button must render when POLLS=true');
});
