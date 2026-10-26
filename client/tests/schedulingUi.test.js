import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Register jsx transpiler loader for tests
register('./jsxLoader.js', import.meta.url);

const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const { MemoryRouter } = await import('react-router-dom');

const {
  _resetFeaturesCacheForTesting,
  _setCachedFeaturesForTesting,
} = await import('../src/hooks/useFeature.js');

const {
  formatInvitationText,
  getGoogleCalendarUrl,
} = await import('../src/lib/invitation.js');

const SchedulePage = (await import('../src/pages/SchedulePage.jsx')).default;
const MeetingDetailsPage = (await import('../src/pages/MeetingDetailsPage.jsx')).default;
const PersonalRoomPage = (await import('../src/pages/PersonalRoomPage.jsx')).default;
const WorkplaceHome = (await import('../src/components/dashboard/WorkplaceHome.jsx')).default;

const { AuthContext } = await import('../src/context/AuthContext.jsx');

test.beforeEach(() => {
  _resetFeaturesCacheForTesting();
});

// Helper to render component wrapped in MemoryRouter and AuthContext
function renderWithRouter(component, user = null) {
  return renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: { user, status: user ? 'authenticated' : 'unauthenticated' } },
      React.createElement(MemoryRouter, null, component)
    )
  );
}

// ---------------------------------------------------------------------------
// 1. Invitation Utilities Tests
// ---------------------------------------------------------------------------

test('formatInvitationText: formats complete invitation with time zone, code, and passcode', () => {
  const text = formatInvitationText({
    title: 'Sprint Planning',
    scheduledAt: '2026-10-30T14:00:00.000Z',
    timeZone: 'America/New_York',
    duration: 45,
    code: 'abc-defg-hij',
    passcode: 'SecretPass123',
    baseUrl: 'https://joinus.test',
  });

  assert.ok(text.includes('Sprint Planning'), 'Should include meeting title');
  assert.ok(text.includes('Duration: 45 minutes'), 'Should include duration');
  assert.ok(text.includes('Meeting Code: abc-defg-hij'), 'Should include meeting code');
  assert.ok(text.includes('Passcode: SecretPass123'), 'Should include passcode when provided');
  assert.ok(text.includes('https://joinus.test/m/abc-defg-hij'), 'Should include direct join link');
  assert.ok(text.includes('America/New_York'), 'Should include timezone');
});

test('formatInvitationText: omits passcode line when no passcode is set', () => {
  const text = formatInvitationText({
    title: 'Quick Catchup',
    scheduledAt: '2026-10-30T14:00:00.000Z',
    code: 'xyz-uvw-123',
    baseUrl: 'https://joinus.test',
  });

  assert.ok(!text.includes('Passcode:'), 'Should omit passcode line when not set');
  assert.ok(text.includes('Meeting Code: xyz-uvw-123'), 'Should include meeting code');
});

test('getGoogleCalendarUrl: builds template URL with dates, details, and meeting link', () => {
  const url = getGoogleCalendarUrl({
    title: 'Design Review',
    description: 'Reviewing the latest mockups',
    scheduledAt: '2026-10-30T10:00:00.000Z',
    duration: 60,
    code: 'des-ign-rev',
    baseUrl: 'https://joinus.test',
  });

  assert.ok(url.startsWith('https://calendar.google.com/calendar/render?'), 'Should target Google Calendar render endpoint');
  assert.ok(url.includes('action=TEMPLATE'), 'Action must be TEMPLATE');
  assert.ok(url.includes('text=Design+Review'), 'Title must be encoded');
  assert.ok(url.includes('20261030T100000Z'), 'Dates param must contain start UTC date');
  assert.ok(url.includes('20261030T110000Z'), 'Dates param must contain end UTC date (+60 min)');
  assert.ok(url.includes('des-ign-rev'), 'Location or details must contain meeting code');
});

// ---------------------------------------------------------------------------
// 2. SchedulePage Tests (Prompt 5 gating & Success Card)
// ---------------------------------------------------------------------------

test('SchedulePage: hides passcode and mute on entry when FEATURE_HOST_SECURITY is disabled', () => {
  _setCachedFeaturesForTesting({ HOST_SECURITY: false, SCHEDULING: true });

  const html = renderWithRouter(React.createElement(SchedulePage));

  assert.ok(html.includes('Schedule a Meeting'), 'Schedule page heading must render');
  assert.ok(html.includes('Meeting Title'), 'Title field must render');
  assert.ok(html.includes('Duration'), 'Duration select must render');
  assert.ok(html.includes('Time Zone'), 'Timezone select must render');
  assert.ok(html.includes('Enable waiting room'), 'Waiting room toggle must render');
  assert.ok(html.includes('Repeat meeting'), 'Recurrence option must render');

  // Security fields must be hidden
  assert.ok(!html.includes('Meeting Passcode'), 'Passcode field must NOT be rendered when HOST_SECURITY is OFF');
  assert.ok(!html.includes('Mute participants upon entry'), 'Mute on entry must NOT be rendered when HOST_SECURITY is OFF');
});

test('SchedulePage: renders passcode and mute on entry when FEATURE_HOST_SECURITY is enabled', () => {
  _setCachedFeaturesForTesting({ HOST_SECURITY: true, SCHEDULING: true });

  const html = renderWithRouter(React.createElement(SchedulePage));

  assert.ok(html.includes('Meeting Passcode'), 'Passcode field must be rendered when HOST_SECURITY is ON');
  assert.ok(html.includes('Mute participants upon entry'), 'Mute on entry must be rendered when HOST_SECURITY is ON');
  assert.ok(html.includes('Meeting Security &amp; Admission') || html.includes('Meeting Security & Admission'), 'Security section header must be present');
});

test('SchedulePage: renders success confirmation card with invitation and calendar actions', () => {
  _setCachedFeaturesForTesting({ SCHEDULING: true });

  const mockCreated = {
    id: 'm-created-1',
    code: 'sch-edu-led',
    title: 'Quarterly Sync',
    scheduledAt: '2026-11-01T15:00:00.000Z',
    duration: 45,
    timeZone: 'UTC',
    waitingRoom: true,
  };

  const html = renderWithRouter(React.createElement(SchedulePage, {
    initialCreatedMeeting: mockCreated,
  }));

  assert.ok(html.includes('Meeting Scheduled!'), 'Success heading must be rendered');
  assert.ok(html.includes('Quarterly Sync'), 'Created meeting title must be displayed');
  assert.ok(html.includes('sch-edu-led'), 'Meeting code must be displayed');
  assert.ok(html.includes('Copy Invitation'), 'Copy invitation action must be available');
  assert.ok(html.includes('Download .ics'), 'Calendar .ics action must be available');
  assert.ok(html.includes('Add to Google Calendar'), 'Google calendar link must be available');
  assert.ok(html.includes('Join Meeting'), 'Join meeting button must be present');
});

// ---------------------------------------------------------------------------
// 3. MeetingDetailsPage Tests (Viewer Timezone, Host Actions, Invitations)
// ---------------------------------------------------------------------------

test('MeetingDetailsPage: renders details, duration, viewer timezone, and host edit/cancel actions', () => {
  _setCachedFeaturesForTesting({ SCHEDULING: true, HOST_SECURITY: true });

  const mockMeeting = {
    id: 'm-detail-1',
    code: 'det-ail-123',
    title: 'All Hands Meeting',
    description: 'Company-wide updates and Q&A',
    scheduledAt: '2026-11-05T18:00:00.000Z',
    duration: 60,
    timeZone: 'America/New_York',
    waitingRoom: true,
    passcode: 'AllHands2026',
    status: 'upcoming',
    host: { id: 'u-host-1', name: 'Sarah Connor', email: 'sarah@test.com' },
  };

  // Render as the host
  const hostHtml = renderWithRouter(React.createElement(MeetingDetailsPage, {
    initialMeeting: mockMeeting,
  }), { id: 'u-host-1', name: 'Sarah Connor' });

  assert.ok(hostHtml.includes('All Hands Meeting'), 'Meeting title must be shown');
  assert.ok(hostHtml.includes('Company-wide updates and Q&amp;A') || hostHtml.includes('Company-wide updates and Q&A'), 'Description must be displayed');
  assert.ok(hostHtml.includes('60 minutes'), 'Duration must be displayed');
  assert.ok(hostHtml.includes('Sarah Connor'), 'Host name must be displayed');
  assert.ok(hostHtml.includes('det-ail-123'), 'Meeting code must be displayed');
  assert.ok(hostHtml.includes('Edit Meeting'), 'Host must see Edit Meeting button');
  assert.ok(hostHtml.includes('Cancel Meeting'), 'Host must see Cancel Meeting button');
  assert.ok(hostHtml.includes('Copy Invitation'), 'Copy invitation button must be displayed');
  assert.ok(hostHtml.includes('Download .ics'), 'Download .ics action must be displayed');
  assert.ok(hostHtml.includes('Google Calendar'), 'Google Calendar action must be displayed');
  assert.ok(hostHtml.includes('Join Meeting'), 'Join Meeting button must be displayed');

  // Render as guest: Edit and Cancel should NOT be rendered
  const guestHtml = renderWithRouter(React.createElement(MeetingDetailsPage, {
    initialMeeting: mockMeeting,
  }), { id: 'u-guest-9', name: 'Guest User' });

  assert.ok(!guestHtml.includes('Edit Meeting'), 'Guest must NOT see Edit Meeting button');
  assert.ok(!guestHtml.includes('Cancel Meeting'), 'Guest must NOT see Cancel Meeting button');
});

// ---------------------------------------------------------------------------
// 4. PersonalRoomPage Tests (Host instant join, Guest active vs waiting)
// ---------------------------------------------------------------------------

test('PersonalRoomPage: renders waiting message when host has not started the room yet', () => {
  const html = renderWithRouter(React.createElement(PersonalRoomPage, {
    initialRoomData: {
      active: false,
      host: { id: 'u-host', name: 'Dr. Jane' },
      message: 'The host has not started the room yet',
    },
  }));

  assert.ok(html.includes("Dr. Jane&#x27;s Personal Room") || html.includes("Dr. Jane's Personal Room"), 'Host name must be in room title');
  assert.ok(html.includes('The host has not started the room yet'), 'Must display exact waiting notice');
  assert.ok(html.includes('Refresh Status'), 'Refresh action must be present');
});

test('PersonalRoomPage: renders active join interface when host is currently in the room', () => {
  const html = renderWithRouter(React.createElement(PersonalRoomPage, {
    initialRoomData: {
      active: true,
      code: 'jane-live-room',
      host: { id: 'u-host', name: 'Dr. Jane' },
    },
  }));

  assert.ok(html.includes("Dr. Jane&#x27;s Personal Room") || html.includes("Dr. Jane's Personal Room"), 'Host name must be in room title');
  assert.ok(html.includes('Live'), 'Live status badge must be rendered');
  assert.ok(html.includes('The host is in the meeting room'), 'Notice that host is in room must be displayed');
  assert.ok(html.includes('Join Meeting'), 'Join Meeting button must be displayed');
});

test('PersonalRoomPage: renders room not found state when slug does not exist', () => {
  const html = renderWithRouter(React.createElement(PersonalRoomPage, {
    initialError: 'Personal meeting room not found',
  }));

  assert.ok(html.includes('Room Not Found'), 'Not found heading must be shown');
  assert.ok(html.includes('could not be found'), 'Clear error explanation must be displayed');
  assert.ok(html.includes('Go to Home'), 'Navigation fallback must be displayed');
});

// ---------------------------------------------------------------------------
// 5. WorkplaceHome Dashboard Integration
// ---------------------------------------------------------------------------

test('WorkplaceHome: renders Personal Meeting Room banner when FEATURE_SCHEDULING is ON', () => {
  _setCachedFeaturesForTesting({ SCHEDULING: true });

  const html = renderWithRouter(React.createElement(WorkplaceHome, {
    timeString: '11:00 AM',
    dateString: 'Friday, October 30, 2026',
    onStartInstant: () => {},
    onOpenJoin: () => {},
    onOpenSchedule: () => {},
    onStartShare: () => {},
    supportsScreenShare: true,
    todayMeetings: [],
    inProgress: [],
    upcoming: [
      {
        id: 'm-up-1',
        code: 'upc-omi-ng1',
        title: 'Weekly Sync',
        scheduledAt: new Date().toISOString(),
        host: { id: 'u1', name: 'Alice' },
      },
    ],
    recent: [],
    searchQuery: '',
    onClearSearch: () => {},
    navigate: () => {},
    user: { id: 'u1', name: 'Alice', personalRoomSlug: 'alice-room' },
    getRecentBadgeKind: () => 'past',
    meetingsStatus: 'ready',
    meetingsError: '',
    onRetry: () => {},
  }));

  assert.ok(html.includes('Personal Meeting Room'), 'Personal room banner heading must be present');
  assert.ok(html.includes('/room/alice-room'), 'Personal room URL must be present');
  assert.ok(html.includes('Details'), 'Details button on upcoming meeting card must be present');
});
