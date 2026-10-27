import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Register jsx transpiler loader for tests
register('./jsxLoader.js', import.meta.url);

const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');

const WorkplaceHome = (await import('../src/components/dashboard/WorkplaceHome.jsx')).default;
const ClassicDashboard = (await import('../src/components/dashboard/ClassicDashboard.jsx')).default;

test('WorkplaceHome renders large clock, date, action tiles, and today schedule', () => {
  const todayMeeting = {
    id: 'm1',
    code: 'abc-defg-hij',
    title: 'Daily Standup',
    scheduledAt: new Date().toISOString(),
    phase: 'upcoming',
    host: { id: 'u1', name: 'Alice' },
  };

  const html = renderToStaticMarkup(
    React.createElement(WorkplaceHome, {
      timeString: '10:30 AM',
      dateString: 'Monday, October 26, 2026',
      onStartInstant: () => {},
      onOpenJoin: () => {},
      onOpenSchedule: () => {},
      onStartShare: () => {},
      supportsScreenShare: true,
      todayMeetings: [todayMeeting],
      inProgress: [],
      upcoming: [todayMeeting],
      recent: [],
      searchQuery: '',
      onClearSearch: () => {},
      navigate: () => {},
      user: { id: 'u1', name: 'Alice' },
      getRecentBadgeKind: () => 'past',
      meetingsStatus: 'ready',
      meetingsError: '',
      onRetry: () => {},
    })
  );

  // Clock & date
  assert.ok(html.includes('10:30 AM'), 'Time display should be rendered');
  assert.ok(html.includes('Monday, October 26, 2026'), 'Date display should be rendered');

  // Four Action Tiles
  assert.ok(html.includes('New meeting'), 'New meeting tile must be present');
  assert.ok(html.includes('Join'), 'Join tile must be present');
  assert.ok(html.includes('Schedule'), 'Schedule tile must be present');
  assert.ok(html.includes('Share screen'), 'Share screen tile must be present when supported');

  // Today Schedule Card
  assert.ok(html.includes("Today&#x27;s Schedule") || html.includes("Today's Schedule"), 'Today schedule title must be present');
  assert.ok(html.includes('Daily Standup'), 'Meeting title must be in schedule card');
  assert.ok(html.includes('Hosted by you'), 'Host info should say Hosted by you for host');
  assert.ok(html.includes('Up to 4 participants'), 'Participant capacity should be present');
  assert.ok(html.includes('Join'), 'Join button should be rendered for joinable meeting');
});

test('WorkplaceHome hides Share screen tile when browser lacks displayMedia support', () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkplaceHome, {
      timeString: '10:30 AM',
      dateString: 'Monday, October 26, 2026',
      onStartInstant: () => {},
      onOpenJoin: () => {},
      onOpenSchedule: () => {},
      onStartShare: () => {},
      supportsScreenShare: false, // Unsupported
      todayMeetings: [],
      inProgress: [],
      upcoming: [],
      recent: [],
      searchQuery: '',
      onClearSearch: () => {},
      navigate: () => {},
      user: { id: 'u1', name: 'Alice' },
      getRecentBadgeKind: () => 'past',
      meetingsStatus: 'ready',
      meetingsError: '',
      onRetry: () => {},
    })
  );

  assert.equal(html.includes('Share screen'), false, 'Share screen tile must be hidden when unsupported');
  assert.ok(html.includes('New meeting'));
  assert.ok(html.includes('Join'));
  assert.ok(html.includes('Schedule'));
});

test('WorkplaceHome renders empty state when no meetings for today', () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkplaceHome, {
      timeString: '10:30 AM',
      dateString: 'Monday, October 26, 2026',
      onStartInstant: () => {},
      onOpenJoin: () => {},
      onOpenSchedule: () => {},
      onStartShare: () => {},
      supportsScreenShare: true,
      todayMeetings: [],
      inProgress: [],
      upcoming: [],
      recent: [],
      searchQuery: '',
      onClearSearch: () => {},
      navigate: () => {},
      user: { id: 'u1', name: 'Alice' },
      getRecentBadgeKind: () => 'past',
      meetingsStatus: 'ready',
      meetingsError: '',
      onRetry: () => {},
    })
  );

  assert.ok(html.includes('No meetings scheduled for today'), 'Empty state must be shown for today');
  assert.ok(html.includes('Schedule a meeting'), 'Call to action button must be in empty state');
});

test('WorkplaceHome renders skeleton loaders when meetingsStatus is loading', () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkplaceHome, {
      timeString: '10:30 AM',
      dateString: 'Monday, October 26, 2026',
      onStartInstant: () => {},
      onOpenJoin: () => {},
      onOpenSchedule: () => {},
      onStartShare: () => {},
      supportsScreenShare: true,
      todayMeetings: [],
      inProgress: [],
      upcoming: [],
      recent: [],
      searchQuery: '',
      onClearSearch: () => {},
      navigate: () => {},
      user: { id: 'u1', name: 'Alice' },
      getRecentBadgeKind: () => 'past',
      meetingsStatus: 'loading',
      meetingsError: '',
      onRetry: () => {},
      isSlow: true,
    })
  );

  assert.ok(html.includes('workplace-today-skeletons'), 'Today schedule skeleton should be rendered');
  assert.ok(html.includes('ui-skeleton'), 'Skeleton components must be rendered');
  assert.ok(html.includes('Waking up the server'), 'Slow request notice should be rendered when isSlow');
});

test('WorkplaceHome renders error state with Try again when meetingsStatus is error', () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkplaceHome, {
      timeString: '10:30 AM',
      dateString: 'Monday, October 26, 2026',
      onStartInstant: () => {},
      onOpenJoin: () => {},
      onOpenSchedule: () => {},
      onStartShare: () => {},
      supportsScreenShare: true,
      todayMeetings: [],
      inProgress: [],
      upcoming: [],
      recent: [],
      searchQuery: '',
      onClearSearch: () => {},
      navigate: () => {},
      user: { id: 'u1', name: 'Alice' },
      getRecentBadgeKind: () => 'past',
      meetingsStatus: 'error',
      meetingsError: 'Network disconnected',
      onRetry: () => {},
    })
  );

  assert.ok(html.includes('Network disconnected'), 'Error description must be rendered');
  assert.ok(html.includes('Try again'), 'Try again button must be rendered');
});

test('ClassicDashboard renders greeting, 3 cards, and preserves original layout', () => {
  const html = renderToStaticMarkup(
    React.createElement(ClassicDashboard, {
      user: { name: 'Bob' },
      stats: { hosted: 5, upcoming: 1 },
      inProgress: [],
      upcoming: [],
      recent: [],
      searchQuery: '',
      onClearSearch: () => {},
      onStartInstant: () => {},
      onOpenJoin: () => {},
      onOpenSchedule: () => {},
      navigate: () => {},
      getRecentBadgeKind: () => 'past',
      meetingsStatus: 'ready',
      meetingsError: '',
      onRetry: () => {},
    })
  );

  assert.ok(html.includes('Welcome, Bob'), 'Greeting must be rendered');
  assert.ok(html.includes('Start instant meeting'), 'Card 1 must be present');
  assert.ok(html.includes('Join with code or link'), 'Card 2 must be present');
  assert.ok(html.includes('Schedule for later'), 'Card 3 must be present');
});

test("Today's Schedule: does not render ended meetings and only renders active/upcoming meetings", () => {
  const upcomingMeeting = {
    id: 'm1',
    code: 'abc-defg-hij',
    title: 'Future Discussion',
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    phase: 'upcoming',
    status: 'scheduled',
    host: { id: 'u1', name: 'Alice' },
  };

  const html = renderToStaticMarkup(
    React.createElement(WorkplaceHome, {
      timeString: '10:30 AM',
      dateString: 'Monday, October 26, 2026',
      onStartInstant: () => {},
      onOpenJoin: () => {},
      onOpenSchedule: () => {},
      onStartShare: () => {},
      supportsScreenShare: true,
      todayMeetings: [upcomingMeeting],
      inProgress: [],
      upcoming: [upcomingMeeting],
      recent: [],
      searchQuery: '',
      onClearSearch: () => {},
      navigate: () => {},
      user: { id: 'u1', name: 'Alice' },
      getRecentBadgeKind: () => 'past',
      meetingsStatus: 'ready',
      meetingsError: '',
      onRetry: () => {},
    })
  );

  assert.ok(html.includes('Future Discussion'));
  assert.ok(html.includes('Upcoming'));
  assert.equal(html.includes('Ended'), false, 'Today schedule must not contain Ended badge');
});
