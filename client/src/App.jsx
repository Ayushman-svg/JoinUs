import { Navigate, Route, Routes } from 'react-router-dom';

import AuthLayout from './components/AuthLayout.jsx';
import GuestRoute from './components/GuestRoute.jsx';
import MeetingLayout from './components/MeetingLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppShell from './components/shell/AppShell.jsx';
import CallPage from './pages/CallPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import MeetingPage from './pages/MeetingPage.jsx';
import Register from './pages/Register.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
        </Route>
        <Route element={<MeetingLayout />}>
          <Route path="/m/:code" element={<MeetingPage />} />
          <Route path="/m/:code/call" element={<CallPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
