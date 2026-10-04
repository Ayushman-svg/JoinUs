import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';

export default function AppHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="topbar">
      <Link to="/" className="brand brand-link">
        JoinUs
      </Link>
      <div className="topbar-actions">
        <span className="muted user-name">{user.name}</span>
        <button className="btn btn-secondary" type="button" onClick={logout}>
          Log out
        </button>
      </div>
    </header>
  );
}
