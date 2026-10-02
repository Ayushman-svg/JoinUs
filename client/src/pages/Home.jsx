import { useAuth } from '../context/AuthContext.jsx';

export default function Home() {
  const { user, logout } = useAuth();

  return (
    <div className="page">
      <header className="topbar">
        <span className="brand">JoinUs</span>
        <div className="topbar-actions">
          <span className="muted user-name">{user.name}</span>
          <button className="btn btn-secondary" type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="content">
        <h1>Hi, {user.name}</h1>
        <p className="muted">You are signed in as {user.email}.</p>
      </main>
    </div>
  );
}
