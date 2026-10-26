import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Trash2, Calendar, Users, MessageSquare, Info, X } from 'lucide-react';

import {
  getInAppNotifications,
  subscribeInAppNotifications,
  markAllInAppNotificationsAsRead,
  clearInAppNotifications,
  checkUpcomingMeetingReminders,
} from '../lib/notifications.js';
import { listMeetings } from '../api/meetings.js';
import Button from './ui/Button.jsx';

export default function NotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(getInAppNotifications());
  const [open, setOpen] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    return subscribeInAppNotifications(setNotifications);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Periodic reminder checker for meetings starting in 10 minutes
  useEffect(() => {
    const check = () => {
      listMeetings('upcoming')
        .then((data) => {
          if (data?.meetings) checkUpcomingMeetingReminders(data.meetings);
        })
        .catch(() => {
          /* ignore periodic fetch errors */
        });
    };

    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getIcon = (type) => {
    switch (type) {
      case 'meeting':
        return <Calendar size={16} className="notif-icon notif-icon--meeting" aria-hidden="true" />;
      case 'waiting':
        return <Users size={16} className="notif-icon notif-icon--waiting" aria-hidden="true" />;
      case 'chat':
        return <MessageSquare size={16} className="notif-icon notif-icon--chat" aria-hidden="true" />;
      default:
        return <Info size={16} className="notif-icon notif-icon--info" aria-hidden="true" />;
    }
  };

  const handleItemClick = (notif) => {
    if (notif.link) {
      setOpen(false);
      navigate(notif.link);
    }
  };

  return (
    <div className="notif-bell-container" ref={bellRef}>
      <button
        type="button"
        className={`shell-header__icon-btn notif-bell-btn ${open ? 'is-active' : ''}`}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        title="Notifications"
      >
        <Bell size={19} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown" role="region" aria-label="Notifications list">
          <div className="notif-header">
            <span className="notif-header-title">Notifications</span>
            <div className="notif-header-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="notif-header-btn"
                  onClick={markAllInAppNotificationsAsRead}
                  title="Mark all as read"
                >
                  <Check size={14} aria-hidden="true" />
                  <span>Mark read</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  className="notif-header-btn"
                  onClick={clearInAppNotifications}
                  title="Clear all notifications"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <Bell size={28} className="notif-empty-icon" aria-hidden="true" />
                <p className="notif-empty-text">No notifications yet</p>
                <span className="notif-empty-sub">
                  Reminders for upcoming meetings and session events will appear here.
                </span>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${!n.read ? 'notif-item--unread' : ''} ${n.link ? 'notif-item--clickable' : ''}`}
                  onClick={() => handleItemClick(n)}
                  role={n.link ? 'button' : undefined}
                  tabIndex={n.link ? 0 : undefined}
                >
                  <div className="notif-item-icon-box">{getIcon(n.type)}</div>
                  <div className="notif-item-content">
                    <div className="notif-item-header">
                      <strong className="notif-item-title">{n.title}</strong>
                      <span className="notif-item-time">
                        {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="notif-item-message">{n.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
