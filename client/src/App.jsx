import { Route, Routes } from 'react-router-dom';

import AuthLayout from './components/AuthLayout.jsx';
import GuestRoute from './components/GuestRoute.jsx';
import MeetingLayout from './components/MeetingLayout.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import PublicLayout from './components/public/PublicLayout.jsx';
import AppShell from './components/shell/AppShell.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useFeature } from './hooks/useFeature.js';
import CallPage from './pages/CallPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import HistoryDetailPage from './pages/HistoryDetailPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import Login from './pages/Login.jsx';
import MeetingPage from './pages/MeetingPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import FeaturesPage from './pages/public/FeaturesPage.jsx';
import PrivacyPage from './pages/public/PrivacyPage.jsx';
import SecurityPage from './pages/public/SecurityPage.jsx';
import TermsPage from './pages/public/TermsPage.jsx';
import Register from './pages/Register.jsx';
import SchedulePage from './pages/SchedulePage.jsx';


export default function App() {
  const landingEnabled = useFeature('LANDING');
  const { status } = useAuth();

  const isGuestLanding = landingEnabled && status === 'unauthenticated';

  return (
    <>
      <OfflineBanner />
      <Routes>
        {/* Public Landing & Marketing Pages (active when FEATURE_LANDING is ON) */}
        {landingEnabled && (
          <Route element={<PublicLayout />}>
            {isGuestLanding && <Route path="/" element={<LandingPage />} />}
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/security" element={<SecurityPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
          </Route>
        )}

        <Route element={<GuestRoute />}>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            {!isGuestLanding && <Route path="/" element={<Dashboard />} />}
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/history/:code" element={<HistoryDetailPage />} />

          </Route>
          <Route element={<MeetingLayout />}>
            <Route path="/m/:code" element={<MeetingPage />} />
            <Route path="/m/:code/call" element={<CallPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
