import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  History,
  Home,
  Info,
  Keyboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext.jsx';
import BrandMark from '../BrandMark.jsx';
import ThemeToggle from '../ThemeToggle.jsx';
import Avatar from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import Dropdown, { DropdownHeader, DropdownItem, DropdownSeparator } from '../ui/Dropdown.jsx';
import Input from '../ui/Input.jsx';
import Modal from '../ui/Modal.jsx';
import Tooltip from '../ui/Tooltip.jsx';

export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('joinus_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [helpModal, setHelpModal] = useState(null); // 'shortcuts' | 'about' | null
  const searchInputRef = useRef(null);

  // Close mobile drawer on route navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Persist collapsed state
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('joinus_sidebar_collapsed', String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Close mobile drawer with Escape
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  // Global shortcut: press '/' to focus search input when not typing in a field
  useEffect(() => {
    function handleKeyDown(e) {
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) &&
        !document.activeElement?.isContentEditable
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const homeLink = (
    <NavLink
      to="/"
      end
      className={({ isActive }) =>
        `shell-nav__item ${isActive ? 'is-active' : ''} ${collapsed ? 'is-collapsed' : ''}`.trim()
      }
      aria-label="Home"
    >
      <Home size={20} aria-hidden="true" />
      {!collapsed && <span className="shell-nav__label">Home</span>}
    </NavLink>
  );

  const historyLink = (
    <NavLink
      to="/history"
      className={({ isActive }) =>
        `shell-nav__item ${isActive ? 'is-active' : ''} ${collapsed ? 'is-collapsed' : ''}`.trim()
      }
      aria-label="History"
    >
      <History size={20} aria-hidden="true" />
      {!collapsed && <span className="shell-nav__label">History</span>}
    </NavLink>
  );

  return (
    <div className={`app-shell ${collapsed ? 'is-sidebar-collapsed' : ''}`}>
      {/* Desktop Sidebar */}
      <aside className={`shell-sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Sidebar navigation">
        <div className="shell-sidebar__header">
          <Link to="/" className="shell-sidebar__brand" aria-label="JoinUs Home">
            <span className="shell-sidebar__logo">
              <Video size={20} aria-hidden="true" />
            </span>
            {!collapsed && <span className="shell-sidebar__brand-text">JoinUs</span>}
          </Link>
          <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
            <button
              type="button"
              className="shell-sidebar__toggle"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={toggleCollapsed}
            >
              {collapsed ? (
                <PanelLeftOpen size={18} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={18} aria-hidden="true" />
              )}
            </button>
          </Tooltip>
        </div>

        <nav className="shell-sidebar__nav">
          <ul className="shell-nav__list">
            <li className="shell-nav__entry">
              {collapsed ? (
                <Tooltip label="Home" side="right">
                  {homeLink}
                </Tooltip>
              ) : (
                homeLink
              )}
            </li>
            <li className="shell-nav__entry">
              {collapsed ? (
                <Tooltip label="History" side="right">
                  {historyLink}
                </Tooltip>
              ) : (
                historyLink
              )}
            </li>
          </ul>
        </nav>
      </aside>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="shell-drawer__backdrop"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={`shell-drawer ${mobileOpen ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile Navigation"
      >
        <div className="shell-drawer__header">
          <Link to="/" className="shell-sidebar__brand" onClick={() => setMobileOpen(false)}>
            <span className="shell-sidebar__logo">
              <Video size={20} aria-hidden="true" />
            </span>
            <span className="shell-sidebar__brand-text">JoinUs</span>
          </Link>
          <Button
            variant="ghost"
            iconOnly
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} aria-hidden="true" />
          </Button>
        </div>

        <nav className="shell-drawer__nav">
          <ul className="shell-nav__list">
            <li className="shell-nav__entry">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `shell-nav__item ${isActive ? 'is-active' : ''}`.trim()
                }
                onClick={() => setMobileOpen(false)}
              >
                <Home size={20} aria-hidden="true" />
                <span className="shell-nav__label">Home</span>
              </NavLink>
            </li>
            <li className="shell-nav__entry">
              <NavLink
                to="/history"
                className={({ isActive }) =>
                  `shell-nav__item ${isActive ? 'is-active' : ''}`.trim()
                }
                onClick={() => setMobileOpen(false)}
              >
                <History size={20} aria-hidden="true" />
                <span className="shell-nav__label">History</span>
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="shell-drawer__footer">
          <div className="shell-drawer__user">
            <Avatar name={user?.name || 'User'} size="md" />
            <div className="shell-drawer__user-meta">
              <span className="shell-drawer__user-name">{user?.name}</span>
              <span className="shell-drawer__user-email">{user?.email}</span>
            </div>
          </div>
          <Button variant="secondary" fullWidth leftIcon={LogOut} onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>

      {/* Main Container */}
      <div className="shell-main">
        {/* Header */}
        <header className="shell-header">
          <div className="shell-header__left">
            <Button
              variant="ghost"
              iconOnly
              className="shell-header__mobile-toggle"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} aria-hidden="true" />
            </Button>
            <Link to="/" className="shell-header__brand" aria-label="JoinUs Home">
              <BrandMark />
            </Link>
            <div className="shell-header__search">
              <Input
                ref={searchInputRef}
                type="search"
                placeholder="Search meetings by title or code… (/ to focus)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={Search}
                aria-label="Search my meetings"
              />
            </div>
          </div>

          <div className="shell-header__right">
            {/* Help & Resources Menu */}
            <Dropdown
              label="Help and resources"
              align="end"
              trigger={({ props, open }) => (
                <button
                  type="button"
                  className={`shell-header__icon-btn ${open ? 'is-active' : ''}`}
                  aria-label="Help and documentation"
                  title="Help & resources"
                  {...props}
                >
                  <HelpCircle size={19} aria-hidden="true" />
                </button>
              )}
            >
              <DropdownHeader>
                <p className="shell-dropdown-heading">Help & Resources</p>
              </DropdownHeader>
              <DropdownItem icon={Keyboard} onSelect={() => setHelpModal('shortcuts')}>
                Keyboard shortcuts
              </DropdownItem>
              <DropdownItem icon={BookOpen} onSelect={() => navigate('/#faq')}>
                Frequently asked questions
              </DropdownItem>
              <DropdownItem icon={ShieldCheck} onSelect={() => navigate('/security')}>
                Security architecture
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem
                icon={ExternalLink}
                onSelect={() =>
                  window.open(
                    'https://github.com/Ayushman-svg/JoinUs/issues',
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
              >
                Report an issue on GitHub
              </DropdownItem>
              <DropdownItem icon={Info} onSelect={() => setHelpModal('about')}>
                About JoinUs
              </DropdownItem>
            </Dropdown>

            <ThemeToggle />

            {/* Profile Dropdown Menu */}
            <Dropdown
              label="Account settings"
              align="end"
              trigger={({ props, open }) => (
                <button
                  type="button"
                  className={`shell-header__profile-btn ${open ? 'is-active' : ''}`}
                  aria-label="Account menu"
                  {...props}
                >
                  <Avatar name={user?.name || 'User'} size="sm" />
                  <span className="shell-header__profile-name">{user?.name}</span>
                  <ChevronDown size={14} className="shell-header__profile-chevron" aria-hidden="true" />
                </button>
              )}
            >
              <DropdownHeader>
                <div className="shell-dropdown-user">
                  <p className="shell-dropdown-name">{user?.name}</p>
                  <p className="shell-dropdown-email">{user?.email}</p>
                </div>
              </DropdownHeader>
              <DropdownSeparator />
              <DropdownItem icon={LogOut} danger onSelect={logout}>
                Sign out
              </DropdownItem>
            </Dropdown>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="shell-content">
          <Outlet context={{ searchQuery, setSearchQuery }} />
        </main>
      </div>

      {/* Keyboard Shortcuts Modal */}
      <Modal
        open={helpModal === 'shortcuts'}
        onClose={() => setHelpModal(null)}
        title="Keyboard Shortcuts"
        description="Quick keystroke commands available across the app and in active meetings."
        size="md"
        footer={
          <Button variant="secondary" onClick={() => setHelpModal(null)}>
            Close
          </Button>
        }
      >
        <table className="shell-shortcuts-table">
          <thead>
            <tr>
              <th scope="col">Shortcut</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><kbd>/</kbd></td>
              <td>Focus meetings search bar</td>
            </tr>
            <tr>
              <td><kbd>M</kbd></td>
              <td>Toggle microphone (mute / unmute in call)</td>
            </tr>
            <tr>
              <td><kbd>V</kbd></td>
              <td>Toggle camera (start / stop video in call)</td>
            </tr>
            <tr>
              <td><kbd>S</kbd></td>
              <td>Toggle screen sharing</td>
            </tr>
            <tr>
              <td><kbd>C</kbd></td>
              <td>Toggle in-meeting chat drawer</td>
            </tr>
            <tr>
              <td><kbd>Esc</kbd></td>
              <td>Close open modal, popover, or drawer</td>
            </tr>
          </tbody>
        </table>
      </Modal>

      {/* About JoinUs Modal */}
      <Modal
        open={helpModal === 'about'}
        onClose={() => setHelpModal(null)}
        title="About JoinUs"
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setHelpModal(null)}>
            Done
          </Button>
        }
      >
        <div className="shell-about-content">
          <p>
            <strong>JoinUs</strong> is an open-source, host-moderated video conferencing platform.
          </p>
          <p>
            Built with custom WebRTC peer-to-peer audio/video mesh, Socket.io signaling, host waiting room
            admission controls, and persistent MongoDB chat transcripts.
          </p>
          <p className="shell-about-meta">
            <span>Version 1.0.0</span> &bull; <span>Independent portfolio project</span>
          </p>
        </div>
      </Modal>
    </div>
  );
}
