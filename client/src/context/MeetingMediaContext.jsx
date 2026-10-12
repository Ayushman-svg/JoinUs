import { createContext, useContext } from 'react';

import useLocalMedia from '../hooks/useLocalMedia.js';

const MeetingMediaContext = createContext(null);

// Owns the local camera and microphone for every page under /m/:code. The join screen and the
// call share this one stream, so there is no second permission check or camera flicker, and
// the mute and camera choices carry over. It is released when the user leaves the meeting routes.
// Nothing starts by itself: a page calls start() when it needs the devices.
export function MeetingMediaProvider({ children }) {
  const media = useLocalMedia({ autoStart: false });
  return <MeetingMediaContext.Provider value={media}>{children}</MeetingMediaContext.Provider>;
}

export function useMeetingMedia() {
  const context = useContext(MeetingMediaContext);
  if (!context) throw new Error('useMeetingMedia must be used inside <MeetingMediaProvider>');
  return context;
}
