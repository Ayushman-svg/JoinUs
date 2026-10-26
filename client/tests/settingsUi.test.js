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

const { AuthContext } = await import('../src/context/AuthContext.jsx');
const SettingsPage = (await import('../src/pages/SettingsPage.jsx')).default;
const AppShell = (await import('../src/components/shell/AppShell.jsx')).default;
const NotificationBell = (await import('../src/components/NotificationBell.jsx')).default;

const {
  getNotificationSettings,
  saveNotificationSettings,
  getInAppNotifications,
  addInAppNotification,
  markAllInAppNotificationsAsRead,
  clearInAppNotifications,
  checkUpcomingMeetingReminders,
} = await import('../src/lib/notifications.js');

test.beforeEach(() => {
  _resetFeaturesCacheForTesting();
  clearInAppNotifications();
});

// Helper to render component wrapped in MemoryRouter and AuthContext
function renderWithContext(component, user = null) {
  return renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: { user, status: user ? 'authenticated' : 'unauthenticated', logout: () => {} } },
      React.createElement(MemoryRouter, null, component)
    )
  );
}

// ---------------------------------------------------------------------------
// 1. SettingsPage Grouped Panels & Tabs
// ---------------------------------------------------------------------------

test('SettingsPage: renders header, navigation tabs, and default Profile panel', () => {
  const mockUser = {
    id: 'u-123',
    name: 'Sarah Connor',
    email: 'sarah@resistance.org',
    timeZone: 'America/Los_Angeles',
    defaultWaitingRoom: true,
    defaultMuteOnEntry: false,
  };

  const html = renderWithContext(React.createElement(SettingsPage), mockUser);

  // Header
  assert.ok(html.includes('Account &amp; Application Settings') || html.includes('Account & Application Settings'), 'Title must be rendered');

  // Navigation Tabs
  assert.ok(html.includes('Profile'), 'Profile tab must be present');
  assert.ok(html.includes('Security'), 'Security tab must be present');
  assert.ok(html.includes('Audio &amp; Video') || html.includes('Audio & Video'), 'Audio & Video tab must be present');
  assert.ok(html.includes('Meetings'), 'Meetings tab must be present');
  assert.ok(html.includes('Appearance'), 'Appearance tab must be present');
  assert.ok(html.includes('Notifications'), 'Notifications tab must be present');

  // Profile Panel Details
  assert.ok(html.includes('Profile Information'), 'Profile panel heading must be displayed');
  assert.ok(html.includes('Sarah Connor'), 'Full name must be prefilled');
  assert.ok(html.includes('sarah@resistance.org'), 'Email must be displayed');
  assert.ok(html.includes('Email is tied to your account and cannot be modified'), 'Email must be clearly marked read-only');
  assert.ok(html.includes('Photo uploads are disabled to keep JoinUs lightweight and private'), 'Initials avatar note must be present');
  assert.ok(html.includes('America/Los_Angeles'), 'Saved timezone must be selected');
});

// ---------------------------------------------------------------------------
// 2. AppShell Sidebar Gating & Notification Bell
// ---------------------------------------------------------------------------

test('AppShell: hides Settings link in sidebar when FEATURE_SETTINGS is disabled', () => {
  _setCachedFeaturesForTesting({ SETTINGS: false });

  const html = renderWithContext(React.createElement(AppShell), { name: 'Alice' });

  assert.ok(html.includes('Home'), 'Home link must be rendered');
  assert.ok(html.includes('History'), 'History link must be rendered');
  assert.ok(!html.includes('href="/settings"'), 'Settings link must NOT be rendered when flag is OFF');
});

test('AppShell: renders Settings link in sidebar and mobile drawer when FEATURE_SETTINGS is enabled', () => {
  _setCachedFeaturesForTesting({ SETTINGS: true });

  const html = renderWithContext(React.createElement(AppShell), { name: 'Alice' });

  assert.ok(html.includes('href="/settings"'), 'Settings link must be rendered when flag is ON');
  assert.ok(html.includes('aria-label="Settings"'), 'Settings nav item must have aria-label');
  assert.ok(html.includes('notif-bell-btn'), 'Notification bell must be present in header');
});

// ---------------------------------------------------------------------------
// 3. Notification Store & Reminders Logic
// ---------------------------------------------------------------------------

test('Notification store: handles add, mark as read, and clear', () => {
  clearInAppNotifications();
  assert.equal(getInAppNotifications().length, 0);

  addInAppNotification({
    id: 'notif-1',
    title: 'Guest waiting',
    message: 'John Doe is waiting in the lobby',
    type: 'waiting',
  });

  const list = getInAppNotifications();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Guest waiting');
  assert.equal(list[0].read, false);

  markAllInAppNotificationsAsRead();
  assert.equal(getInAppNotifications()[0].read, true);

  clearInAppNotifications();
  assert.equal(getInAppNotifications().length, 0);
});

test('checkUpcomingMeetingReminders: notifies for meetings starting within 10 minutes and ignores others', () => {
  clearInAppNotifications();
  const now = Date.now();

  const meetings = [
    {
      id: 'm1',
      code: 'soon-meet-1',
      title: 'Daily Standup',
      // Starts in 6 minutes
      scheduledAt: new Date(now + 6 * 60 * 1000).toISOString(),
    },
    {
      id: 'm2',
      code: 'far-meet-2',
      title: 'Quarterly Planning',
      // Starts in 2 hours
      scheduledAt: new Date(now + 120 * 60 * 1000).toISOString(),
    },
  ];

  checkUpcomingMeetingReminders(meetings);

  const notifications = getInAppNotifications();
  assert.equal(notifications.length, 1, 'Only the meeting starting in 10 minutes should trigger a reminder');
  assert.equal(notifications[0].title, 'Meeting starting soon');
  assert.ok(notifications[0].message.includes('Daily Standup'), 'Message should include meeting title');
  assert.ok(notifications[0].message.includes('6 minutes'), 'Message should indicate time remaining');
  assert.equal(notifications[0].link, '/m/soon-meet-1', 'Notification should link to meeting room');
});

test('NotificationBell: renders empty state when no notifications exist', () => {
  clearInAppNotifications();
  const html = renderWithContext(React.createElement(NotificationBell));

  assert.ok(html.includes('notif-bell-btn'), 'Bell button must be present');
  assert.ok(!html.includes('notif-badge'), 'Badge should not appear when count is 0');
});
