const CODE_PATTERN = /\b([a-z]{3}-[a-z]{4}-[a-z]{3})\b/i;

export function inviteLink(code) {
  return `${window.location.origin}/m/${code}`;
}

// Accepts a bare code ("abc-defg-hij") or a full invite link; returns null if none found
export function extractMeetingCode(text) {
  const match = String(text).trim().match(CODE_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the legacy path (insecure origins, older browsers) */
  }

  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
