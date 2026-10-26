import { useState, useEffect, useRef } from 'react';
import {
  User,
  Shield,
  Mic,
  Video,
  Calendar,
  Sun,
  Moon,
  Monitor,
  Bell,
  Check,
  AlertCircle,
  AlertTriangle,
  Lock,
  Globe,
  Mail,
  Volume2,
  Camera,
  Play,
  Square,
  RefreshCw,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';
import useTheme from '../hooks/useTheme.js';
import { updateProfile, changePassword } from '../api/auth.js';
import Avatar from '../components/ui/Avatar.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Alert from '../components/ui/Alert.jsx';
import Modal from '../components/ui/Modal.jsx';
import {
  getNotificationSettings,
  saveNotificationSettings,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  clearInAppNotifications,
} from '../lib/notifications.js';

const MEDIA_SETTINGS_KEY = 'joinus_media_settings';

export function getMediaSettings() {
  try {
    const raw = localStorage.getItem(MEDIA_SETTINGS_KEY);
    return raw
      ? JSON.parse(raw)
      : {
          defaultMicOn: true,
          defaultCameraOn: true,
          preferredMicId: '',
          preferredCameraId: '',
        };
  } catch {
    return {
      defaultMicOn: true,
      defaultCameraOn: true,
      preferredMicId: '',
      preferredCameraId: '',
    };
  }
}

export function saveMediaSettings(settings) {
  try {
    localStorage.setItem(MEDIA_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

function getTimeZones() {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone');
    }
  } catch {
    /* fallback below */
  }
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Australia/Sydney',
  ];
}

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'audio-video', label: 'Audio & Video', icon: Mic },
  { id: 'meetings', label: 'Meetings', icon: Calendar },
  { id: 'appearance', label: 'Appearance', icon: Sun },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

export default function SettingsPage() {
  const { user, updateUser } = useAuth() || {};
  const { preference, setPreference } = useTheme();

  const [activeTab, setActiveTab] = useState('profile');

  // Profile state
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileTimeZone, setProfileTimeZone] = useState(user?.timeZone || 'UTC');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Security (password) state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Meetings defaults state
  const [defaultWaitingRoom, setDefaultWaitingRoom] = useState(
    user?.defaultWaitingRoom !== undefined ? user.defaultWaitingRoom : true
  );
  const [defaultMuteOnEntry, setDefaultMuteOnEntry] = useState(
    user?.defaultMuteOnEntry !== undefined ? user.defaultMuteOnEntry : false
  );
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [meetingsSuccess, setMeetingsSuccess] = useState('');
  const [meetingsError, setMeetingsError] = useState('');

  // Audio / Video settings
  const [mediaSettings, setMediaSettingsState] = useState(getMediaSettings);
  const [devices, setDevices] = useState({ mics: [], cameras: [] });
  const [cameraActive, setCameraActive] = useState(false);
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const videoPreviewRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animFrameRef = useRef(null);

  // Notifications settings
  const [notifSettings, setNotifSettings] = useState(getNotificationSettings);
  const [permissionStatus, setPermissionStatus] = useState(getBrowserNotificationPermission);

  // Unsaved changes guard
  const [pendingTab, setPendingTab] = useState(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  // Synchronize state when user object loads/changes
  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfileTimeZone(user.timeZone || 'UTC');
      setDefaultWaitingRoom(user.defaultWaitingRoom !== undefined ? user.defaultWaitingRoom : true);
      setDefaultMuteOnEntry(user.defaultMuteOnEntry !== undefined ? user.defaultMuteOnEntry : false);
    }
  }, [user]);

  // Compute dirty states
  const isProfileDirty = Boolean(
    user && (profileName.trim() !== (user.name || '').trim() || profileTimeZone !== (user.timeZone || 'UTC'))
  );
  const isPasswordDirty = Boolean(currentPassword || newPassword || confirmPassword);
  const isMeetingsDirty = Boolean(
    user &&
      (defaultWaitingRoom !== (user.defaultWaitingRoom !== undefined ? user.defaultWaitingRoom : true) ||
        defaultMuteOnEntry !== (user.defaultMuteOnEntry !== undefined ? user.defaultMuteOnEntry : false))
  );

  const hasUnsavedChanges = isProfileDirty || isPasswordDirty || isMeetingsDirty;

  // Window beforeunload warning
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Handle switching tabs safely
  const handleTabClick = (tabId) => {
    if (tabId === activeTab) return;
    if (hasUnsavedChanges) {
      setPendingTab(tabId);
      setShowDiscardModal(true);
    } else {
      setActiveTab(tabId);
    }
  };

  const handleDiscardChanges = () => {
    // Reset dirty forms
    if (user) {
      setProfileName(user.name || '');
      setProfileTimeZone(user.timeZone || 'UTC');
      setDefaultWaitingRoom(user.defaultWaitingRoom !== undefined ? user.defaultWaitingRoom : true);
      setDefaultMuteOnEntry(user.defaultMuteOnEntry !== undefined ? user.defaultMuteOnEntry : false);
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setProfileError('');
    setPasswordError('');
    setMeetingsError('');

    setShowDiscardModal(false);
    if (pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab(null);
    }
  };

  // Device enumeration
  useEffect(() => {
    async function loadDevices() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        const mics = list.filter((d) => d.kind === 'audioinput');
        const cameras = list.filter((d) => d.kind === 'videoinput');
        setDevices({ mics, cameras });
      } catch {
        /* ignore */
      }
    }
    loadDevices();
  }, []);

  // Stop camera stream cleanup
  const stopCameraPreview = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Start camera preview
  const startCameraPreview = async () => {
    stopCameraPreview();
    try {
      const constraints = {
        video: mediaSettings.preferredCameraId
          ? { deviceId: { exact: mediaSettings.preferredCameraId } }
          : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      cameraStreamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch {
      setCameraActive(false);
    }
  };

  // Stop mic test cleanup
  const stopMicTest = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setMicLevel(0);
    setMicTesting(false);
  };

  // Start mic test
  const startMicTest = async () => {
    stopMicTest();
    try {
      const constraints = {
        audio: mediaSettings.preferredMicId
          ? { deviceId: { exact: mediaSettings.preferredMicId } }
          : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i += 1) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      setMicTesting(true);
      updateMeter();
    } catch {
      stopMicTest();
    }
  };

  // Cleanup media on unmount
  useEffect(() => {
    return () => {
      stopCameraPreview();
      stopMicTest();
    };
  }, []);

  // Update media settings helper
  const updateMediaSetting = (key, value) => {
    const next = { ...mediaSettings, [key]: value };
    setMediaSettingsState(next);
    saveMediaSettings(next);
  };

  // Save profile handler
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    if (profileName.trim().length < 2) {
      setProfileError('Name must be at least 2 characters');
      return;
    }

    setProfileLoading(true);
    try {
      const updated = await updateProfile({
        name: profileName.trim(),
        timeZone: profileTimeZone,
      });
      if (updateUser) updateUser(updated);
      setProfileSuccess('Profile updated successfully');
      setTimeout(() => setProfileSuccess(''), 4000);
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  // Change password handler
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('Current password is required');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordLoading(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setPasswordSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 4000);
    } catch (err) {
      if (err.status === 400 && err.code === 'INVALID_CURRENT_PASSWORD') {
        setPasswordError('Current password is incorrect');
      } else if (err.status === 429) {
        setPasswordError('Too many attempts. Please try again in 15 minutes.');
      } else {
        setPasswordError(err.message || 'Failed to change password');
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  // Save meetings defaults handler
  const handleSaveMeetings = async (e) => {
    e.preventDefault();
    setMeetingsError('');
    setMeetingsSuccess('');
    setMeetingsLoading(true);

    try {
      const updated = await updateProfile({
        defaultWaitingRoom,
        defaultMuteOnEntry,
      });
      if (updateUser) updateUser(updated);
      setMeetingsSuccess('Meeting defaults saved successfully');
      setTimeout(() => setMeetingsSuccess(''), 4000);
    } catch (err) {
      setMeetingsError(err.message || 'Failed to save meeting defaults');
    } finally {
      setMeetingsLoading(false);
    }
  };

  // Notification toggles helper
  const handleNotifToggle = (key) => {
    const next = { ...notifSettings, [key]: !notifSettings[key] };
    setNotifSettings(next);
    saveNotificationSettings(next);
  };

  // Request browser notification permission
  const handleRequestPermission = async () => {
    const res = await requestBrowserNotificationPermission();
    setPermissionStatus(res);
  };

  const availableTimeZones = getTimeZones();

  return (
    <div className="settings-page">
      <div className="settings-header">
        <div>
          <h1 className="settings-title">Account & Application Settings</h1>
          <p className="settings-subtitle">
            Manage your personal profile, security credentials, meeting preferences, and notifications.
          </p>
        </div>
        {hasUnsavedChanges && (
          <div className="settings-unsaved-badge" role="status">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>Unsaved changes</span>
          </div>
        )}
      </div>

      <div className="settings-layout">
        {/* Navigation Tabs */}
        <aside className="settings-sidebar" aria-label="Settings panels">
          <nav className="settings-nav">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`settings-nav-btn ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleTabClick(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={18} className="settings-nav-icon" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Panel Content */}
        <main className="settings-content">
          {/* 1. PROFILE PANEL */}
          {activeTab === 'profile' && (
            <Card className="settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Profile Information</h2>
                <p className="settings-card-desc">
                  Update your display name and default time zone. Email address is read-only.
                </p>
              </div>

              {profileSuccess && (
                <Alert variant="success" icon={Check} className="settings-alert">
                  {profileSuccess}
                </Alert>
              )}
              {profileError && (
                <Alert variant="danger" icon={AlertCircle} className="settings-alert">
                  {profileError}
                </Alert>
              )}

              <div className="profile-avatar-row">
                <Avatar name={profileName || user?.name || 'User'} size="xl" />
                <div className="profile-avatar-info">
                  <span className="profile-avatar-title">Profile Avatar</span>
                  <p className="profile-avatar-desc">
                    Your avatar displays your initials automatically. Photo uploads are disabled to keep JoinUs lightweight and private.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="settings-form">
                <div className="form-group">
                  <label htmlFor="settings-name" className="form-label">
                    Full Name *
                  </label>
                  <div className="input-with-icon">
                    <User size={16} className="input-icon" aria-hidden="true" />
                    <input
                      id="settings-name"
                      type="text"
                      className="input"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      required
                      minLength={2}
                      maxLength={50}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="settings-email" className="form-label">
                    Email Address
                  </label>
                  <div className="input-with-icon">
                    <Mail size={16} className="input-icon" aria-hidden="true" />
                    <input
                      id="settings-email"
                      type="email"
                      className="input input--readonly"
                      value={user?.email || ''}
                      readOnly
                      disabled
                    />
                  </div>
                  <span className="form-hint">Email is tied to your account and cannot be modified.</span>
                </div>

                <div className="form-group">
                  <label htmlFor="settings-timezone" className="form-label">
                    Time Zone
                  </label>
                  <div className="input-with-icon">
                    <Globe size={16} className="input-icon" aria-hidden="true" />
                    <select
                      id="settings-timezone"
                      className="select"
                      value={profileTimeZone}
                      onChange={(e) => setProfileTimeZone(e.target.value)}
                    >
                      {availableTimeZones.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="form-hint">Used by default when scheduling new meetings.</span>
                </div>

                <div className="settings-form-actions">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={profileLoading || !isProfileDirty}
                  >
                    {profileLoading ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* 2. SECURITY PANEL */}
          {activeTab === 'security' && (
            <Card className="settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Security & Password</h2>
                <p className="settings-card-desc">
                  Change your password to keep your account secure. Current password is required.
                </p>
              </div>

              {passwordSuccess && (
                <Alert variant="success" icon={Check} className="settings-alert">
                  {passwordSuccess}
                </Alert>
              )}
              {passwordError && (
                <Alert variant="danger" icon={AlertCircle} className="settings-alert">
                  {passwordError}
                </Alert>
              )}

              <form onSubmit={handleChangePassword} className="settings-form">
                <div className="form-group">
                  <label htmlFor="settings-current-pwd" className="form-label">
                    Current Password *
                  </label>
                  <div className="input-with-icon">
                    <Lock size={16} className="input-icon" aria-hidden="true" />
                    <input
                      id="settings-current-pwd"
                      type="password"
                      className="input"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="settings-new-pwd" className="form-label">
                    New Password *
                  </label>
                  <div className="input-with-icon">
                    <Lock size={16} className="input-icon" aria-hidden="true" />
                    <input
                      id="settings-new-pwd"
                      type="password"
                      className="input"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                  </div>
                  <span className="form-hint">Minimum 8 characters. Rate limited for your protection.</span>
                </div>

                <div className="form-group">
                  <label htmlFor="settings-confirm-pwd" className="form-label">
                    Confirm New Password *
                  </label>
                  <div className="input-with-icon">
                    <Lock size={16} className="input-icon" aria-hidden="true" />
                    <input
                      id="settings-confirm-pwd"
                      type="password"
                      className="input"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="settings-form-actions">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={passwordLoading || !isPasswordDirty}
                  >
                    {passwordLoading ? 'Updating…' : 'Update Password'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* 3. AUDIO & VIDEO PANEL */}
          {activeTab === 'audio-video' && (
            <Card className="settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Audio & Video Settings</h2>
                <p className="settings-card-desc">
                  Configure default device states, preferred hardware, and test your mic and camera preview.
                </p>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-subtitle">Meeting Join Defaults</h3>
                <div className="settings-toggle-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={mediaSettings.defaultMicOn}
                      onChange={(e) => updateMediaSetting('defaultMicOn', e.target.checked)}
                    />
                    <span className="checkbox-custom" />
                    <span>Turn microphone ON when joining a meeting</span>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={mediaSettings.defaultCameraOn}
                      onChange={(e) => updateMediaSetting('defaultCameraOn', e.target.checked)}
                    />
                    <span className="checkbox-custom" />
                    <span>Turn camera ON when joining a meeting</span>
                  </label>
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-subtitle">Microphone</h3>
                <div className="form-group">
                  <label htmlFor="settings-mic-select" className="form-label">
                    Preferred Microphone
                  </label>
                  <select
                    id="settings-mic-select"
                    className="select"
                    value={mediaSettings.preferredMicId}
                    onChange={(e) => updateMediaSetting('preferredMicId', e.target.value)}
                  >
                    <option value="">Default Microphone</option>
                    {devices.mics.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Microphone ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="media-test-row">
                  <Button
                    type="button"
                    variant={micTesting ? 'secondary' : 'outline'}
                    size="sm"
                    leftIcon={micTesting ? Square : Volume2}
                    onClick={micTesting ? stopMicTest : startMicTest}
                  >
                    {micTesting ? 'Stop Mic Test' : 'Test Microphone'}
                  </Button>
                  <div className="mic-meter-bar" aria-label="Microphone input volume level">
                    <div
                      className="mic-meter-fill"
                      style={{ width: `${micTesting ? micLevel : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-subtitle">Camera</h3>
                <div className="form-group">
                  <label htmlFor="settings-camera-select" className="form-label">
                    Preferred Camera
                  </label>
                  <select
                    id="settings-camera-select"
                    className="select"
                    value={mediaSettings.preferredCameraId}
                    onChange={(e) => updateMediaSetting('preferredCameraId', e.target.value)}
                  >
                    <option value="">Default Camera</option>
                    {devices.cameras.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Camera ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="camera-preview-box">
                  <div className="camera-preview-viewport">
                    <video
                      ref={videoPreviewRef}
                      autoPlay
                      playsInline
                      muted
                      className={`camera-preview-video ${cameraActive ? 'is-active' : ''}`}
                    />
                    {!cameraActive && (
                      <div className="camera-preview-placeholder">
                        <Camera size={32} aria-hidden="true" />
                        <span>Camera preview is off</span>
                      </div>
                    )}
                  </div>
                  <div className="camera-preview-actions">
                    <Button
                      type="button"
                      variant={cameraActive ? 'secondary' : 'primary'}
                      size="sm"
                      leftIcon={cameraActive ? Square : Play}
                      onClick={cameraActive ? stopCameraPreview : startCameraPreview}
                    >
                      {cameraActive ? 'Stop Preview' : 'Test Camera Preview'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 4. MEETINGS DEFAULTS PANEL */}
          {activeTab === 'meetings' && (
            <Card className="settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Meeting Defaults</h2>
                <p className="settings-card-desc">
                  Set the default security and admission rules applied whenever you create or schedule a new meeting.
                </p>
              </div>

              {meetingsSuccess && (
                <Alert variant="success" icon={Check} className="settings-alert">
                  {meetingsSuccess}
                </Alert>
              )}
              {meetingsError && (
                <Alert variant="danger" icon={AlertCircle} className="settings-alert">
                  {meetingsError}
                </Alert>
              )}

              <form onSubmit={handleSaveMeetings} className="settings-form">
                <div className="settings-toggle-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={defaultWaitingRoom}
                      onChange={(e) => setDefaultWaitingRoom(e.target.checked)}
                    />
                    <span className="checkbox-custom" />
                    <div>
                      <strong className="toggle-heading">Enable waiting room by default</strong>
                      <p className="toggle-sub">
                        Guests wait in the lobby until admitted by you or a co-host.
                      </p>
                    </div>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={defaultMuteOnEntry}
                      onChange={(e) => setDefaultMuteOnEntry(e.target.checked)}
                    />
                    <span className="checkbox-custom" />
                    <div>
                      <strong className="toggle-heading">Mute participants upon entry by default</strong>
                      <p className="toggle-sub">
                        Participants enter the meeting room with their microphones muted.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="settings-form-actions">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={meetingsLoading || !isMeetingsDirty}
                  >
                    {meetingsLoading ? 'Saving…' : 'Save Defaults'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* 5. APPEARANCE PANEL */}
          {activeTab === 'appearance' && (
            <Card className="settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Appearance & Theme</h2>
                <p className="settings-card-desc">
                  Choose your interface display preference: Light, Dark, or automatically match your System settings.
                </p>
              </div>

              <div className="theme-options-grid">
                {[
                  { id: 'light', label: 'Light', icon: Sun, desc: 'Clean, bright background' },
                  { id: 'dark', label: 'Dark', icon: Moon, desc: 'Sleek, low-light contrast' },
                  { id: 'system', label: 'System', icon: Monitor, desc: 'Follows your operating system' },
                ].map((th) => {
                  const Icon = th.icon;
                  const isSelected = preference === th.id;
                  return (
                    <button
                      key={th.id}
                      type="button"
                      className={`theme-card ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setPreference(th.id)}
                      aria-pressed={isSelected}
                    >
                      <div className="theme-card-icon-box">
                        <Icon size={24} aria-hidden="true" />
                      </div>
                      <strong className="theme-card-title">{th.label}</strong>
                      <span className="theme-card-desc">{th.desc}</span>
                      {isSelected && (
                        <div className="theme-card-check">
                          <Check size={16} aria-hidden="true" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* 6. NOTIFICATIONS PANEL */}
          {activeTab === 'notifications' && (
            <Card className="settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Notifications</h2>
                <p className="settings-card-desc">
                  Manage real-time browser alerts and in-app bell notifications. No fake or marketing notifications.
                </p>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-subtitle">Browser Permission</h3>
                <div className="notif-permission-box">
                  <div className="notif-permission-status">
                    <span>Browser permission status:</span>
                    <strong className={`notif-status-pill notif-status-pill--${permissionStatus}`}>
                      {permissionStatus === 'granted'
                        ? 'Granted'
                        : permissionStatus === 'denied'
                          ? 'Blocked / Denied'
                          : 'Not Requested'}
                    </strong>
                  </div>
                  {permissionStatus !== 'granted' && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleRequestPermission}
                    >
                      Enable Browser Notifications
                    </Button>
                  )}
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-subtitle">Notification Triggers</h3>
                <div className="settings-toggle-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={notifSettings.waitingRoomAlert}
                      onChange={() => handleNotifToggle('waitingRoomAlert')}
                    />
                    <span className="checkbox-custom" />
                    <div>
                      <strong className="toggle-heading">Someone is waiting in the lobby</strong>
                      <p className="toggle-sub">
                        Alerts you when a guest joins the waiting room while you are hosting.
                      </p>
                    </div>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={notifSettings.meetingSoonAlert}
                      onChange={() => handleNotifToggle('meetingSoonAlert')}
                    />
                    <span className="checkbox-custom" />
                    <div>
                      <strong className="toggle-heading">Meeting starting soon</strong>
                      <p className="toggle-sub">
                        Notifies you 10 minutes before your scheduled meetings start.
                      </p>
                    </div>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={notifSettings.hiddenChatAlert}
                      onChange={() => handleNotifToggle('hiddenChatAlert')}
                    />
                    <span className="checkbox-custom" />
                    <div>
                      <strong className="toggle-heading">Chat message while the tab is hidden</strong>
                      <p className="toggle-sub">
                        Sends a desktop alert when someone sends a message while you are in another tab or window.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-subtitle">Session In-App History</h3>
                <p className="settings-card-desc">
                  Clear notifications stored in your current browser session.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearInAppNotifications}
                >
                  Clear Session Notifications
                </Button>
              </div>
            </Card>
          )}
        </main>
      </div>

      {/* Unsaved Changes Confirmation Modal */}
      <Modal
        open={showDiscardModal}
        onClose={() => setShowDiscardModal(false)}
        title="Unsaved Changes"
        description="You have unsaved changes in this panel. If you leave now, your changes will be lost."
      >
        <div className="settings-modal-actions">
          <Button
            variant="ghost"
            onClick={() => setShowDiscardModal(false)}
          >
            Stay &amp; Continue Editing
          </Button>
          <Button
            variant="danger"
            onClick={handleDiscardChanges}
          >
            Discard Changes
          </Button>
        </div>
      </Modal>
    </div>
  );
}
