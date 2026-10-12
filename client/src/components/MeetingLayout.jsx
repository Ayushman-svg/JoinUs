import { Outlet } from 'react-router-dom';

import { MeetingMediaProvider } from '../context/MeetingMediaContext.jsx';

// Wraps the meeting routes (join screen and call) so they can share one local media stream
export default function MeetingLayout() {
  return (
    <MeetingMediaProvider>
      <Outlet />
    </MeetingMediaProvider>
  );
}
