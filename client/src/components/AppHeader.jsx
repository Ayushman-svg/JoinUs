import { ChevronDown, LogOut, Video } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import Avatar from './ui/Avatar.jsx';
import Dropdown, { DropdownHeader, DropdownItem, DropdownSeparator } from './ui/Dropdown.jsx';

export default function AppHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="shell-header">
      <div className="shell-header__left">
        <Link to="/" className="shell-sidebar__brand" aria-label="JoinUs Home">
          <span className="shell-sidebar__logo">
            <Video size={20} aria-hidden="true" />
          </span>
          <span className="shell-sidebar__brand-text">JoinUs</span>
        </Link>
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
  );
}
