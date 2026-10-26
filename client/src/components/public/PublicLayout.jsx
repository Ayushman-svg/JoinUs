import { Outlet } from 'react-router-dom';

import PublicFooter from './PublicFooter.jsx';
import PublicHeader from './PublicHeader.jsx';

export default function PublicLayout() {
  return (
    <div className="public-layout">
      <PublicHeader />
      <main className="public-layout__main">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
