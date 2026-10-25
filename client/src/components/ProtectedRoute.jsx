import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import FullPageLoader from './FullPageLoader.jsx';

// Only signed-in users may see the nested routes
export default function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader label="Checking your session…" />;
  if (status === 'unauthenticated') {
    let expiredNotice = false;
    try {
      if (sessionStorage.getItem('joinus_session_expired') === '1') {
        sessionStorage.removeItem('joinus_session_expired');
        expiredNotice = true;
      }
    } catch {
      /* ignore */
    }
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location,
          message: expiredNotice ? 'Your session expired, please sign in again' : undefined,
        }}
      />
    );
  }
  return <Outlet />;
}
