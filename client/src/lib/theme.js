// Theme preference: 'light' | 'dark' | 'system'. Plain JS, no React.
// The resolved theme ('light' | 'dark') is applied as data-theme on <html>.
// index.html applies it once before first paint; this module keeps it up to date.
const STORAGE_KEY = 'joinus-theme';
const listeners = new Set();

const emit = () => listeners.forEach((listener) => listener());

export function getThemePreference() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(preference) {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getResolvedTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(preference = getThemePreference()) {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.dataset.theme = resolved;

  // Keep the browser UI color (mobile address bar) in line with the page background
  const meta = document.querySelector('meta[name="theme-color"]');
  const background = getComputedStyle(root).getPropertyValue('--color-background').trim();
  if (meta && background) meta.setAttribute('content', background);

  return resolved;
}

export function setThemePreference(preference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
  applyTheme(preference);
  emit();
}

export function subscribeTheme(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Follows the operating system while the preference is 'system'. Returns an unsubscribe function.
export function watchSystemTheme() {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (getThemePreference() === 'system') {
      applyTheme('system');
      emit();
    }
  };
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
