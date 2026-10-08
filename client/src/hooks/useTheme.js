import { useSyncExternalStore } from 'react';

import {
  getResolvedTheme,
  getThemePreference,
  setThemePreference,
  subscribeTheme,
} from '../lib/theme.js';

const getSnapshot = () => `${getThemePreference()}:${getResolvedTheme()}`;

export default function useTheme() {
  const snapshot = useSyncExternalStore(subscribeTheme, getSnapshot);
  const [preference, resolved] = snapshot.split(':');
  return { preference, resolved, setPreference: setThemePreference };
}
