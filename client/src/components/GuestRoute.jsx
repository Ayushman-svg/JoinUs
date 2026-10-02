import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import FullPageLoader from './FullPageLoader.jsx';

// Login and register pages: signed-in users are sent to where they were heading
export default function GuestRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader label="Checking your session…" />;
  if (status === 'authenticated') {
    const from = location.state?.from;
    const target = from ? `${from.pathname}${from.search || ''}` : '/';
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}
