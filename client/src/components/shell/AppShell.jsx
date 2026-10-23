import {
  ChevronDown,
  History,
  Home,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext.jsx';
import ThemeToggle from '../ThemeToggle.jsx';
import Avatar from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import Dropdown, { DropdownHeader, DropdownItem, DropdownSeparator } from '../ui/Dropdown.jsx';
import Input from '../ui/Input.jsx';
import Tooltip from '../ui/Tooltip.jsx';

export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('joinus_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
            <div className="shell-header__search">
              <Input
                type="search"
                placeholder="Search meetings by title or code…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={Search}
                aria-label="Search meetings"
              />
            </div>
          </div>

          <div className="shell-header__right">
            <ThemeToggle />
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
    </div>
  );
}
