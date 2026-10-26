import { Outlet } from 'react-router-dom';

import PublicFooter from './PublicFooter.jsx';
import PublicHeader from './PublicHeader.jsx';

export default function PublicLayout() {
  return (
    <div className="public-layout">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <PublicHeader />
      <main className="public-layout__main" id="main-content" tabIndex="-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
