const SETTINGS_KEY = 'joinus_notification_settings';
const NOTIFICATIONS_KEY = 'joinus_session_notifications';

export const DEFAULT_NOTIFICATION_SETTINGS = {
  waitingRoomAlert: true,
  meetingSoonAlert: true,
  hiddenChatAlert: true,
};

export function getNotificationSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

export function saveNotificationSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function getBrowserNotificationPermission() {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function requestBrowserNotificationPermission() {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showBrowserNotification(title, options = {}) {
  if (getBrowserNotificationPermission() !== 'granted') return null;
  try {
    return new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });
  } catch {
    return null;
  }
}

// In-app session notification store with subscriber pattern
let sessionNotifications = (() => {
  try {
    const raw = sessionStorage.getItem(NOTIFICATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
})();

const subscribers = new Set();

function persistNotifications() {
  try {
    sessionStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(sessionNotifications));
  } catch {
    /* ignore */
  }
  subscribers.forEach((fn) => fn(sessionNotifications));
}

export function getInAppNotifications() {
  return [...sessionNotifications];
}

export function addInAppNotification({
  id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  title,
  message,
  type = 'info', // 'meeting' | 'waiting' | 'chat' | 'info'
  link = '',
  timestamp = new Date().toISOString(),
}) {
  // Avoid duplicate notifications with same id
  if (sessionNotifications.some((n) => n.id === id)) return;

  const item = {
    id,
    title,
    message,
    type,
    link,
    timestamp,
    read: false,
  };

  sessionNotifications = [item, ...sessionNotifications].slice(0, 50);
  persistNotifications();

  // Also trigger desktop notification if permitted and setting allows
  const settings = getNotificationSettings();
  if (
    (type === 'waiting' && settings.waitingRoomAlert) ||
    (type === 'meeting' && settings.meetingSoonAlert) ||
    (type === 'chat' && settings.hiddenChatAlert && typeof document !== 'undefined' && document.hidden)
  ) {
    showBrowserNotification(title, { body: message });
  }
}

export function markAllInAppNotificationsAsRead() {
  sessionNotifications = sessionNotifications.map((n) => ({ ...n, read: true }));
  persistNotifications();
}

export function clearInAppNotifications() {
  sessionNotifications = [];
  persistNotifications();
}

export function subscribeInAppNotifications(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// Track meeting reminders to avoid repeating alerts for the same meeting instance
const remindedMeetingCodes = new Set();

export function checkUpcomingMeetingReminders(meetings = []) {
  if (!Array.isArray(meetings) || meetings.length === 0) return;
  const now = Date.now();
  const TEN_MINUTES_MS = 10 * 60 * 1000;

  meetings.forEach((m) => {
    if (!m?.scheduledAt || !m?.code) return;
    const start = new Date(m.scheduledAt).getTime();
    if (Number.isNaN(start)) return;

    const diff = start - now;
    // If meeting is starting within the next 10 minutes (and hasn't already started > 5m ago)
    if (diff > 0 && diff <= TEN_MINUTES_MS && !remindedMeetingCodes.has(m.code)) {
      remindedMeetingCodes.add(m.code);
      const minutesLeft = Math.max(1, Math.round(diff / 60000));
      addInAppNotification({
        id: `meeting-soon-${m.code}`,
        title: 'Meeting starting soon',
        message: `"${m.title || 'Meeting'}" starts in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
        type: 'meeting',
        link: `/m/${m.code}`,
      });
    }
  });
}
